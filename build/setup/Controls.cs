using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Krono.Setup {
    internal sealed class MattePanel : Panel {
        public MattePanel(){DoubleBuffered=true;SetStyle(ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;}
        protected override void OnPaintBackground(PaintEventArgs e){
            if(SystemInformation.HighContrast){e.Graphics.Clear(SystemColors.Window);return;}
            base.OnPaintBackground(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            using(var path=Material.Round(new RectangleF(1,1,Width-3,Height-3),18)){
                using(var tint=new SolidBrush(Material.Surface))e.Graphics.FillPath(tint,path);
            }
        }
        protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Material.Round(new RectangleF(1,1,Width-3,Height-3),18))using(var pen=new Pen(Material.Border))e.Graphics.DrawPath(pen,p);}
    }
    internal sealed class SmoothLabel : Label {
        public SmoothLabel(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;}
        protected override void OnPaint(PaintEventArgs e){using(var format=new StringFormat{Trimming=StringTrimming.EllipsisCharacter})Material.DrawText(e.Graphics,Text,Font,SystemInformation.HighContrast?SystemColors.WindowText:ForeColor,new RectangleF(0,0,Width,Height),format);}
    }
    internal sealed class MatteCheck : CheckBox {
        public MatteCheck(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true);Cursor=Cursors.Hand;AutoSize=false;BackColor=Color.Transparent;ForeColor=Material.Muted;}
        protected override void OnPaint(PaintEventArgs e){
            var g=e.Graphics;if(BackColor.A==255)g.Clear(BackColor);else base.OnPaintBackground(e);g.SmoothingMode=SmoothingMode.AntiAlias;
            var box=new RectangleF(2,(Height-16)/2,16,16);
            using(var path=Material.Round(box,5)){
                using(var b=new SolidBrush(Checked?Material.Text:Material.Canvas))g.FillPath(b,path);
                using(var p=new Pen(SystemInformation.HighContrast?SystemColors.WindowText:Material.Muted))g.DrawPath(p,path);
            }
            if(Checked)using(var p=new Pen(Color.FromArgb(22,22,26),1.7f)){g.DrawLines(p,new[]{new PointF(6,Height/2),new PointF(9,Height/2+3),new PointF(15,Height/2-4)});}
            using(var f=new StringFormat{LineAlignment=StringAlignment.Center})Material.DrawText(g,Text,Font,SystemInformation.HighContrast?SystemColors.WindowText:ForeColor,new RectangleF(28,0,Width-30,Height),f);
            if(Focused)ControlPaint.DrawFocusRectangle(g,new Rectangle(0,0,Width-1,Height-1));
        }
    }
    internal sealed class PathField : Panel {
        public readonly TextBox Input=new TextBox {BorderStyle=BorderStyle.None};
        public PathField(){DoubleBuffered=true;SetStyle(ControlStyles.SupportsTransparentBackColor,true);BackColor=Color.Transparent;Input.BackColor=Material.Canvas;Input.ForeColor=Material.Text;Input.Font=new Font("Segoe UI",10);Input.AccessibleName="Diretório de instalação";Controls.Add(Input);Padding=new Padding(13,12,13,10);Resize+=(s,e)=>Input.SetBounds(13,(Height-Input.PreferredHeight)/2,Math.Max(1,Width-26),Input.PreferredHeight);Input.GotFocus+=(s,e)=>Invalidate();Input.LostFocus+=(s,e)=>Invalidate();}
        protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Material.Round(new RectangleF(1,1,Width-3,Height-3),11)){using(var b=new SolidBrush(Input.BackColor))e.Graphics.FillPath(b,p);using(var pen=new Pen(Input.ContainsFocus?Material.Text:Material.Border))e.Graphics.DrawPath(pen,p);}}
    }
    internal sealed class ActivityBar : Control {
        public double Phase;
        public bool Animate;
        public ActivityBar(){DoubleBuffered=true;SetStyle(ControlStyles.SupportsTransparentBackColor,true);TabStop=false;BackColor=Color.Transparent;AccessibleRole=AccessibleRole.ProgressBar;AccessibleName="Operação em andamento, sem estimativa de porcentagem";}
        protected override void OnPaint(PaintEventArgs e){
            var g=e.Graphics;base.OnPaintBackground(e);g.SmoothingMode=SmoothingMode.AntiAlias;
            float s=DeviceDpi/96f;bool hc=SystemInformation.HighContrast;
            var track=new RectangleF(s,(Height-5*s)/2,Math.Max(1,Width-2*s),5*s);
            using(var outline=Material.Round(track,2.5f*s)){
                using(var fill=new SolidBrush(hc?SystemColors.Window:Material.Border))g.FillPath(fill,outline);
                var clip=g.Save();g.SetClip(outline);
                float w=Math.Min(160*s,track.Width*.28f);
                double cycle=Phase/2.4-Math.Floor(Phase/2.4);
                float x=Animate?track.X+(float)cycle*(track.Width+w)-w:track.X+(track.Width-w)/2;
                using(var bar=Material.Round(new RectangleF(x,track.Y,w,track.Height),2.5f*s))using(var fill=new SolidBrush(hc?SystemColors.Highlight:Material.Text))g.FillPath(fill,bar);
                g.Restore(clip);
            }
        }
    }
    // Seletor próprio: enumera apenas a pasta escolhida; nunca varre a máquina.
    // Paginação evita scrollbars ou diálogos padrão e mantém teclado nativo.
    internal sealed class FolderPicker : FocusWindow {
        [DllImport("user32.dll")]static extern bool SystemParametersInfo(uint action,uint parameter,out bool value,uint flags);
        [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
        bool nativeCorners;
        readonly Timer entrance=new Timer{Interval=15};
        readonly System.Diagnostics.Stopwatch entranceClock=new System.Diagnostics.Stopwatch();
        readonly bool reduce;
        Point restingPosition;bool entering;
        readonly PathField path=new PathField();
        readonly Label status=new SmoothLabel();
        readonly Panel rows=new Panel();
        readonly MatteButton up=new MatteButton{Text="↑ Pasta acima"},previous=new MatteButton{Text="←"},next=new MatteButton{Text="→"},choose=new MatteButton{Text="Usar esta pasta",Primary=true},drives=new MatteButton{Text="Unidades"};
        string[] children=new string[0];int page; public string Selected="";
        public FolderPicker(string initial,bool reduced=false){
            bool systemAnimate;reduce=reduced||SystemInformation.HighContrast||(SystemParametersInfo(0x1042,0,out systemAnimate,0)&&!systemAnimate);
            SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);DoubleBuffered=true;
            Text="Escolher pasta";FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(620,550);BackColor=Material.Surface;ForeColor=Material.Text;Font=Material.Font(10);KeyPreview=true;AutoScaleMode=AutoScaleMode.Dpi;
            path.SetBounds(24,24,572,46);Controls.Add(path);path.Input.Text=initial;path.Input.KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Enter){LoadFolder(path.Input.Text);e.SuppressKeyPress=true;}};
            up.SetBounds(24,82,160,38);up.Click+=(s,e)=>{try{var parent=Directory.GetParent(path.Input.Text);if(parent!=null)LoadFolder(parent.FullName);}catch(Exception ex){ShowError(ex);}};Controls.Add(up);
            status.SetBounds(200,82,260,40);status.ForeColor=Material.Muted;Controls.Add(status);
            rows.SetBounds(24,132,572,324);Controls.Add(rows);
            drives.SetBounds(480,82,116,38);drives.Click+=(s,e)=>{try{children=DriveInfo.GetDrives().Where(d=>d.DriveType==DriveType.Fixed||d.DriveType==DriveType.Removable).Where(d=>d.IsReady).Select(d=>d.RootDirectory.FullName).ToArray();page=0;RenderRows();}catch(Exception ex){ShowError(ex);}};Controls.Add(drives);
            MouseWheel+=(s,e)=>{if(e.Delta<0&&next.Enabled){page++;RenderRows();}else if(e.Delta>0&&previous.Enabled){page--;RenderRows();}};
            previous.SetBounds(24,482,44,42);next.SetBounds(76,482,44,42);previous.Click+=(s,e)=>{page--;RenderRows();};next.Click+=(s,e)=>{page++;RenderRows();};Controls.Add(previous);Controls.Add(next);
            var cancel=new MatteButton{Text="Cancelar"};cancel.SetBounds(310,482,120,42);cancel.Click+=(s,e)=>{DialogResult=DialogResult.Cancel;Close();};Controls.Add(cancel);
            choose.SetBounds(442,482,154,42);choose.Click+=(s,e)=>{try{string p=Path.GetFullPath(path.Input.Text);if(!Directory.Exists(p)||p.StartsWith("\\\\",StringComparison.Ordinal))throw new IOException("Escolha uma pasta local existente.");Selected=Path.GetFileName(p.TrimEnd('\\')).Equals("Krono",StringComparison.OrdinalIgnoreCase)?p:Path.Combine(p,"Krono");DialogResult=DialogResult.OK;Close();}catch(Exception ex){ShowError(ex);}};Controls.Add(choose);
            KeyDown+=(s,e)=>{if(e.KeyCode==Keys.PageDown&&next.Enabled){page++;RenderRows();e.Handled=true;}else if(e.KeyCode==Keys.PageUp&&previous.Enabled){page--;RenderRows();e.Handled=true;}else if(e.KeyCode==Keys.Escape){DialogResult=DialogResult.Cancel;Close();}};LoadFolder(initial);
            Shown+=(s,e)=>{restingPosition=Location;if(reduce)return;entering=true;Top=restingPosition.Y+6*DeviceDpi/96;entranceClock.Start();entrance.Start();};
            entrance.Tick+=(s,e)=>{double p=Scene.Ease(0,.16,entranceClock.Elapsed.TotalSeconds);Top=restingPosition.Y+(int)Math.Round((1-p)*6*DeviceDpi/96);if(p>=1)FinishEntrance();};
            VisibleChanged+=(s,e)=>{if(!Visible&&entering)FinishEntrance();};
        }
        void FinishEntrance(){entrance.Stop();entranceClock.Stop();entering=false;Location=restingPosition;}
        protected override void OnHandleCreated(EventArgs e){
            base.OnHandleCreated(e);
            // O compositor recorta/antialiasa as quinas sem janela transparente ou fade.
            int round=2;nativeCorners=DwmSetWindowAttribute(Handle,33,ref round,sizeof(int))==0;
            int border=SystemInformation.HighContrast?ColorTranslator.ToWin32(SystemColors.WindowText):ColorTranslator.ToWin32(Material.Border);DwmSetWindowAttribute(Handle,34,ref border,sizeof(int));
            UpdateCorners();
        }
        void UpdateCorners(){
            var previousRegion=Region;
            if(nativeCorners)Region=null;
            else if(Width>0&&Height>0)using(var shape=Material.Round(new RectangleF(0,0,Width,Height),22*DeviceDpi/96f))Region=new Region(shape);
            if(previousRegion!=null)previousRegion.Dispose();
        }
        protected override void OnSizeChanged(EventArgs e){base.OnSizeChanged(e);if(IsHandleCreated)UpdateCorners();}
        protected override void OnPaintBackground(PaintEventArgs e){e.Graphics.Clear(SystemInformation.HighContrast?SystemColors.Window:BackColor);}
        protected override void OnPaint(PaintEventArgs e){
            base.OnPaint(e);if(nativeCorners)return;float s=DeviceDpi/96f;e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
            using(var shape=Material.Round(new RectangleF(s/2,s/2,Width-s,Height-s),22*s))using(var edge=new Pen(SystemInformation.HighContrast?SystemColors.WindowText:Material.Border,s))e.Graphics.DrawPath(edge,shape);
        }
        protected override void Dispose(bool disposing){if(disposing){entrance.Stop();entranceClock.Stop();entering=false;entrance.Dispose();}base.Dispose(disposing);}
        void ShowError(Exception ex){if(!(ex is IOException||ex is UnauthorizedAccessException||ex is ArgumentException||ex is System.Security.SecurityException))throw ex;status.Text="Não foi possível abrir esta pasta.";choose.Enabled=false;}
        void LoadFolder(string value){try{var p=Path.GetFullPath(value);if(p.StartsWith("\\\\",StringComparison.Ordinal))throw new IOException();children=Directory.EnumerateDirectories(p).Where(x=>(File.GetAttributes(x)&FileAttributes.ReparsePoint)==0).OrderBy(x=>x,StringComparer.CurrentCultureIgnoreCase).ToArray();path.Input.Text=p;page=0;choose.Enabled=true;RenderRows();}catch(Exception ex){ShowError(ex);}}
        void RenderRows(){while(rows.Controls.Count>0){var c=rows.Controls[0];rows.Controls.Remove(c);c.Dispose();}foreach(string child in children.Skip(page*6).Take(6)){var b=new MatteButton{Text=Path.GetFileName(child)==""?child:Path.GetFileName(child),TextAlign=ContentAlignment.MiddleLeft};b.SetBounds(0,rows.Controls.Count*52,572,44);b.AccessibleName="Abrir pasta "+b.Text;b.Click+=(s,e)=>LoadFolder(child);rows.Controls.Add(b);}previous.Enabled=page>0;next.Enabled=(page+1)*6<children.Length;status.Text=children.Length==0?"Pasta vazia":"Página "+(page+1)+" · "+children.Length+" pastas";}
#if KRONO_PREVIEW
        internal void RenderPreview(string output){
            Prepare(this);bool reproduced=false;up.BackColor=Material.Canvas;
            try{CaptureAndCheck(Path.Combine(Path.GetDirectoryName(output),"folder-picker-before.png"));}catch(Exception ex){if(!ex.Message.StartsWith("Artefato fora da borda arredondada:",StringComparison.Ordinal))throw;reproduced=true;}finally{up.BackColor=Color.Transparent;}
            if(!reproduced)throw new Exception("Regressão não reproduz o fundo opaco anterior");
            CaptureAndCheck(output);up.PreviewHover(true);next.PreviewHover(true);if(rows.Controls.Count>0)((MatteButton)rows.Controls[0]).PreviewHover(true);CaptureAndCheck(Path.Combine(Path.GetDirectoryName(output),"folder-picker-hover.png"));
        }
        void CaptureAndCheck(string output){
            using(var b=new Bitmap(Width,Height)){
                DrawToBitmap(b,ClientRectangle);b.Save(output,System.Drawing.Imaging.ImageFormat.Png);
                foreach(Control parent in new Control[]{this,rows})foreach(Control c in parent.Controls)if(c is MatteButton){
                    Point at=c.Location;if(parent==rows)at.Offset(rows.Location);
                    foreach(var corner in new[]{new Point(0,0),new Point(c.Width-1,0),new Point(0,c.Height-1),new Point(c.Width-1,c.Height-1)})if(b.GetPixel(at.X+corner.X,at.Y+corner.Y).ToArgb()!=BackColor.ToArgb())throw new Exception("Artefato fora da borda arredondada: "+c.Text);
                }
            }
        }
        internal async System.Threading.Tasks.Task ProbeLive(string output,bool cancel){
            await System.Threading.Tasks.Task.Delay(40);
            if(KeyboardFocus)throw new Exception("Seletor abriu marcado como teclado");up.PreviewAutomaticFocus();
            if(!nativeCorners&&(Region==null||Region.IsVisible(0,0)||!Region.IsVisible(Width/2,Height/2)))throw new Exception("Seletor sem recorte arredondado");
            if(Opacity!=1||!DoubleBuffered||!GetStyle(ControlStyles.AllPaintingInWmPaint))throw new Exception("Janela sem pintura opaca/buffer");
            if(cancel){Hide();await System.Threading.Tasks.Task.Delay(50);if(entering||entrance.Enabled||Opacity!=1)throw new Exception("Entrada continuou invisível");Show();}
            await System.Threading.Tasks.Task.Delay(220);if(entering||entrance.Enabled||Opacity!=1||Location!=restingPosition)throw new Exception("Entrada não assentou");
            if(reduce&&entranceClock.ElapsedTicks!=0)throw new Exception("Redução executou animação");
            up.Focus();if(!up.Focused)throw new Exception("Foco ausente no seletor");up.PreviewKeyboardFocus();CaptureAndCheck(output);up.PreviewMouseFocus();CaptureAndCheck(Path.Combine(Path.GetDirectoryName(output),"folder-pointer.png"));up.PreviewKeyboardFocus();
            for(int i=0;i<8;i++)if(!ProcessDialogKey(Keys.Tab)||!ContainsFocus)throw new Exception("Tab sem foco no seletor");
            OnKeyDown(new KeyEventArgs(Keys.Escape));if(!IsDisposed&&Visible)throw new Exception("Escape não fechou seletor");
        }
        static void Prepare(Control control){var handle=control.Handle;foreach(Control c in control.Controls)Prepare(c);}
#endif
    }
}

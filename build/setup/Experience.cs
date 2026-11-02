using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Krono.Setup {
    internal interface IInstallHost {
        Installation Current { get; }
        Decision Decision { get; }
        bool Preview { get; }
        string Stamp { get; }
        bool CanRemove { get; }
        void Refresh();
        bool AppRunning();
        Task<int> Install(string destination, bool legacy, string stamp, Action<string> status);
        Task<int> Remove(string stamp, Action<string> status);
        void Open();
    }
    internal static class Material {
        public static readonly Color Canvas = Color.FromArgb(27,24,21), Text = Color.FromArgb(238,231,219), Muted = Color.FromArgb(195,185,171), Accent = Color.FromArgb(238,231,219), Surface = Color.FromArgb(41,35,30), Border = Color.FromArgb(80,68,53);
        static readonly PrivateFontCollection Fonts = new PrivateFontCollection();
        static IntPtr memory;
        public static Font Font(float size, bool bold = false) {
            if (memory == IntPtr.Zero) {
                using(var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("font")) {
                    var bytes = new byte[s.Length]; s.Read(bytes,0,bytes.Length); memory = Marshal.AllocCoTaskMem(bytes.Length); Marshal.Copy(bytes,0,memory,bytes.Length);
                    try { Fonts.AddMemoryFont(memory, bytes.Length); } catch (ArgumentException) { }
                }
            }
            return new Font(Fonts.Families.Length > 0 ? Fonts.Families[0] : SystemFonts.MessageBoxFont.FontFamily, size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);
        }
        public static Font Title(float size){return new Font("Georgia",size,FontStyle.Regular,GraphicsUnit.Point);}
        public static GraphicsPath Round(RectangleF r, float radius) {
            var p = new GraphicsPath(); float d = Math.Min(radius*2, Math.Min(r.Width,r.Height));
            p.AddArc(r.X,r.Y,d,d,180,90); p.AddArc(r.Right-d,r.Y,d,d,270,90); p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90); p.AddArc(r.X,r.Bottom-d,d,d,90,90); p.CloseFigure(); return p;
        }
        public static Image Image(string name) { using(var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) using(var b=new Bitmap(s))return new Bitmap(b); }
        public static void DrawText(Graphics target,string text,Font font,Color color,RectangleF bounds,StringFormat format){
            if(bounds.Width<1||bounds.Height<1)return;
            // Antialias em escala 2x, sem ClearType preso à cor do fundo.
            using(var bitmap=new Bitmap((int)Math.Ceiling(bounds.Width*2),(int)Math.Ceiling(bounds.Height*2)))using(var g=Graphics.FromImage(bitmap))using(var brush=new SolidBrush(color)){
                g.ScaleTransform(2,2);g.TextRenderingHint=TextRenderingHint.AntiAlias;g.DrawString(text,font,brush,new RectangleF(0,0,bounds.Width,bounds.Height),format);
                var state=target.Save();target.InterpolationMode=InterpolationMode.HighQualityBicubic;target.PixelOffsetMode=PixelOffsetMode.HighQuality;target.DrawImage(bitmap,bounds);target.Restore(state);
            }
        }
        public static void Contain(Graphics g, Image image, RectangleF box, bool integrateCanvas=false) {
            float scale = Math.Min(box.Width/image.Width, box.Height/image.Height);
            var r = new RectangleF(box.X+(box.Width-image.Width*scale)/2,box.Y+(box.Height-image.Height*scale)/2,image.Width*scale,image.Height*scale);
            if(integrateCanvas&&!SystemInformation.HighContrast){
                using(var attributes=new System.Drawing.Imaging.ImageAttributes()){
                    attributes.SetColorKey(Color.FromArgb(0,0,0),Color.FromArgb(28,28,28));
                    g.DrawImage(image,Rectangle.Round(r),0,0,image.Width,image.Height,GraphicsUnit.Pixel,attributes);
                }
            }else g.DrawImage(image,r);
        }
    }
    // Intenção de entrada pertence à janela, não ao botão que ganhou foco.
    // Filtra somente mensagens deste processo e desta janela/controles filhos.
    internal class FocusWindow : Form, IMessageFilter {
        bool keyboard,registered;
        internal bool KeyboardFocus {get{return keyboard;}}
        internal void SetKeyboardFocus(bool value){if(keyboard==value)return;keyboard=value;Invalidate(true);}
        static bool Navigation(Keys key){key&=Keys.KeyCode;return key==Keys.Tab||key==Keys.Left||key==Keys.Right||key==Keys.Up||key==Keys.Down||key==Keys.Space||key==Keys.Enter||key==Keys.Menu;}
        public bool PreFilterMessage(ref Message m){
            bool pointer=m.Msg==0x201||m.Msg==0x204||m.Msg==0x207||m.Msg==0xA1;
            bool key=(m.Msg==0x100||m.Msg==0x104)&&Navigation((Keys)m.WParam.ToInt32());
            if(!pointer&&!key)return false;
            var control=Control.FromChildHandle(m.HWnd);if(control==null||control.FindForm()!=this)return false;
            SetKeyboardFocus(key);
            return false;
        }
        protected override bool ProcessDialogKey(Keys keyData){if(Navigation(keyData))SetKeyboardFocus(true);return base.ProcessDialogKey(keyData);}
        protected override bool ProcessCmdKey(ref Message msg,Keys keyData){if(Navigation(keyData))SetKeyboardFocus(true);return base.ProcessCmdKey(ref msg,keyData);}
        protected override void OnShown(EventArgs e){var owner=Owner as FocusWindow;if(owner!=null&&owner.KeyboardFocus)SetKeyboardFocus(true);base.OnShown(e);}
        protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);if(!registered){Application.AddMessageFilter(this);registered=true;}}
        protected override void OnHandleDestroyed(EventArgs e){if(registered){Application.RemoveMessageFilter(this);registered=false;}base.OnHandleDestroyed(e);}
    }
    internal sealed class MatteButton : Button {
        public bool Primary;
        public bool Selected;
        public bool Quiet;
        bool hover;
        bool FocusRingVisible {get{var window=FindForm() as FocusWindow;return Focused&&(SystemInformation.HighContrast||window!=null&&window.KeyboardFocus);}}
        public MatteButton() { SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.SupportsTransparentBackColor,true); FlatStyle=FlatStyle.Flat; FlatAppearance.BorderSize=0; BackColor=Color.Transparent; ForeColor=Material.Text; Cursor=Cursors.Hand; }
        protected override void OnMouseEnter(EventArgs e) { hover=true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover=false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e){var window=FindForm() as FocusWindow;if(window!=null)window.SetKeyboardFocus(false);Invalidate();base.OnMouseDown(e);}
        protected override void OnKeyDown(KeyEventArgs e){var window=FindForm() as FocusWindow;if(window!=null)window.SetKeyboardFocus(true);Invalidate();base.OnKeyDown(e);}
        protected override void OnLostFocus(EventArgs e){Invalidate();base.OnLostFocus(e);}
        protected override void OnChangeUICues(UICuesEventArgs e){base.OnChangeUICues(e);Invalidate();}
        protected override void OnPaint(PaintEventArgs e) {
            var g=e.Graphics; g.SmoothingMode=SmoothingMode.AntiAlias;
            if(BackColor.A==255)g.Clear(SystemInformation.HighContrast ? SystemColors.Control : BackColor);else base.OnPaintBackground(e);
            bool hc=SystemInformation.HighContrast;
            using(var path=Material.Round(new RectangleF(1,1,Width-3,Height-3),8)) {
                Color fill = hc ? SystemColors.Control : Primary ? (hover ? Color.White : Material.Text) : (hover || Selected ? Color.FromArgb(65,54,41) : Material.Surface);
                using(var b=new SolidBrush(Enabled ? fill : Material.Surface)) if(!Quiet||hover||hc)g.FillPath(b,path);
                using(var pen=new Pen(hc ? SystemColors.ControlText : Material.Border)) if(!Primary&&!Quiet)g.DrawPath(pen,path);
            }
            g.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;
            using(var f=new StringFormat{Alignment=TextAlign==ContentAlignment.MiddleLeft?StringAlignment.Near:StringAlignment.Center,LineAlignment=StringAlignment.Center,Trimming=StringTrimming.EllipsisCharacter})Material.DrawText(g,Text,Font,hc?SystemColors.ControlText:Enabled?(Primary?Material.Canvas:Quiet?Material.Muted:Material.Text):Material.Muted,TextAlign==ContentAlignment.MiddleLeft?new RectangleF(14,0,Width-28,Height):ClientRectangle,f);
            if(FocusRingVisible)using(var ring=Material.Round(new RectangleF(5,5,Width-11,Height-11),8))using(var pen=new Pen(hc?SystemColors.Highlight:Primary?Material.Canvas:Material.Text,1.5f))g.DrawPath(pen,ring);
        }
#if KRONO_PREVIEW
        internal void PreviewHover(bool value){hover=value;Invalidate();}
        internal void PreviewMouseFocus(){OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,Width/2,Height/2,0));Focus();if(!SystemInformation.HighContrast&&FocusRingVisible)throw new Exception("Clique manteve anel de teclado");}
        internal void PreviewKeyboardFocus(){OnKeyDown(new KeyEventArgs(Keys.Right));Focus();if(!FocusRingVisible)throw new Exception("Teclado perdeu anel de foco");}
        internal void PreviewAutomaticFocus(){Focus();if(!Focused)throw new Exception("Prova de foco automático não focou o botão");if(!SystemInformation.HighContrast&&FocusRingVisible)throw new Exception("Foco automático ganhou anel sem teclado");}
#endif
    }

}

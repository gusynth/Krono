using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Krono.Setup {
    internal sealed class SetupForm : FocusWindow {
        [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr h,int a,ref int v,int size);
        [DllImport("user32.dll")]static extern bool ReleaseCapture();
        [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
        [DllImport("user32.dll")]static extern bool SystemParametersInfo(uint a,uint p,out bool value,uint flags);
        readonly IInstallHost host;
        readonly Scene scene=new Scene();
        readonly MattePanel card=new MattePanel();
        readonly Label title=new SmoothLabel(),subtitle=new SmoothLabel(),detail=new SmoothLabel(),pathLabel=new SmoothLabel(),version=new SmoothLabel();
        readonly MatteButton next=new MatteButton{Primary=true},install=new MatteButton(),remove=new MatteButton{Text="Desinstalar"},browse=new MatteButton{Text="Alterar pasta"},close=new MatteButton{Text="×",Quiet=true},minimize=new MatteButton{Text="−",Quiet=true},skip=new MatteButton{Text="Pular abertura →",Quiet=true};
        readonly MatteCheck consent=new MatteCheck(),motion=new MatteCheck{Text="Reduzir movimento"};
        readonly PathField directory=new PathField();
        readonly ActivityBar progress=new ActivityBar();
        readonly Timer frames=new Timer {Interval=33};
        readonly System.Diagnostics.Stopwatch clock=new System.Diagnostics.Stopwatch();
        bool introDecided,introAllowed,scanning=true,busy,completed,error,removeSelected,choice,reduced,systemReduced,leaving,paused,rebootRequired;
        double elapsed,transitionStart=-1;
        string message="",stamp="";
        bool IsReduced {get{return reduced||systemReduced||SystemInformation.HighContrast;}}
#if KRONO_PREVIEW
        int layoutPasses;
#endif
        static bool SystemReduced(){bool value;return SystemParametersInfo(0x1042,0,out value,0)&&!value;}
        public SetupForm(IInstallHost h){
            host=h;Text=h.Preview?"Krono — prévia sem instalação":"Instalação do Krono";AccessibleName="Instalação do Krono";
            Icon=new Icon(Assembly.GetExecutingAssembly().GetManifestResourceStream("icon"));
            FormBorderStyle=FormBorderStyle.None;AutoScaleMode=AutoScaleMode.Dpi;AutoScaleDimensions=new SizeF(96,96);ClientSize=new Size(820,560);MinimumSize=new Size(720,560);StartPosition=FormStartPosition.CenterScreen;BackColor=Material.Canvas;ForeColor=Material.Text;Font=Material.Font(10);DoubleBuffered=true;KeyPreview=true;
            Controls.Add(card);
            foreach(var label in new[]{title,subtitle,detail,pathLabel,version}){label.ForeColor=Material.Muted;label.BackColor=Color.Transparent;label.AutoSize=false;card.Controls.Add(label);}
            title.Font=Material.Title(24);title.ForeColor=Material.Text;subtitle.Font=Material.Font(10);detail.Font=Material.Font(9);version.Font=Material.Font(8);pathLabel.Text="Diretório de instalação";
            foreach(var button in new[]{next,install,remove,browse}){button.Font=Material.Font(10,false);button.BackColor=Color.Transparent;card.Controls.Add(button);}
            foreach(var button in new[]{close,minimize,skip}){button.Font=Material.Font(9);button.BackColor=Color.Transparent;Controls.Add(button);}
            close.AccessibleName="Fechar instalador";minimize.AccessibleName="Minimizar instalador";skip.AccessibleName="Pular abertura e ir para instalação";
            close.Click+=(s,e)=>RequestClose();minimize.Click+=(s,e)=>WindowState=FormWindowState.Minimized;
            skip.Click+=(s,e)=>{elapsed=0.8;clock.Restart();UpdateMotion();};
            foreach(var check in new[]{consent,motion}){check.Font=Material.Font(8);check.BackColor=Color.Transparent;card.Controls.Add(check);}
            motion.CheckedChanged+=(s,e)=>{reduced=motion.Checked;if(IsReduced){elapsed=1.5;}UpdateMotion();LayoutContent();Invalidate();};
            systemReduced=SystemReduced();motion.Checked=systemReduced;
            consent.CheckedChanged+=(s,e)=>RefreshNext();
            card.Controls.Add(directory);directory.Input.Text=h.Preview?@"C:\Exemplo\Krono":Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Krono");directory.Input.TextChanged+=(s,e)=>RefreshNext();
            directory.TabIndex=2;browse.TabIndex=3;install.TabIndex=0;remove.TabIndex=1;consent.TabIndex=4;next.TabIndex=5;motion.TabIndex=6;
            browse.Click+=(s,e)=>{string p=directory.Input.Text;while(!Directory.Exists(p)&&Path.GetDirectoryName(p)!=null)p=Path.GetDirectoryName(p);using(var picker=new FolderPicker(p,IsReduced)){if(picker.ShowDialog(this)==DialogResult.OK)directory.Input.Text=Policy.InstallDestination(picker.Selected);}};
            install.Click+=(s,e)=>SelectOperation(false);remove.Click+=(s,e)=>SelectOperation(true);
            next.Click+=async(s,e)=>await Forward();card.Controls.Add(progress);AcceptButton=next;
            frames.Tick+=(s,e)=>{double t=Time;bool show=!introDecided||!introAllowed||IsReduced||t>=1.44;card.Visible=show;skip.Visible=!show;if(t<1.8||transitionStart>=0&&t<transitionStart+.24)LayoutContent();progress.Phase=t;progress.Animate=!IsReduced;if(busy||scanning)progress.Invalidate();Invalidate();UpdateMotion();};
            Shown+=async(s,e)=>{int round=2,dark=1;try{DwmSetWindowAttribute(Handle,33,ref round,4);DwmSetWindowAttribute(Handle,20,ref dark,4);}catch(DllNotFoundException){}elapsed=1.5;card.Visible=true;skip.Visible=false;await Scan();if(IsDisposed)return;introAllowed=Policy.PlayIntroduction(host.Decision,error);introDecided=true;if(introAllowed&&!IsReduced){elapsed=0;clock.Restart();}else{elapsed=1.5;clock.Restart();}UpdateMotion();LayoutContent();};
            Resize+=(s,e)=>{UpdateMotion();LayoutContent();};VisibleChanged+=(s,e)=>UpdateMotion();
            FormClosing+=(s,e)=>{if(busy&&!leaving){e.Cancel=true;RequestClose();}};
            MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left&&e.Y<64*DeviceDpi/96f){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}};
            KeyDown+=(s,e)=>{if(e.KeyCode==Keys.Escape){if(Time<1.44){elapsed=0.8;clock.Restart();}else RequestClose();e.Handled=true;}};
            RefreshPage();LayoutContent();card.Visible=IsReduced;
        }
        double Time {get{return elapsed+clock.Elapsed.TotalSeconds;}}
        void UpdateMotion(){
            bool active=Visible&&WindowState!=FormWindowState.Minimized;
            if(!active){if(clock.IsRunning){elapsed=Time;clock.Reset();}paused=true;}
            else if(paused){clock.Start();paused=false;}
            if(active&&introDecided&&!IsReduced&&!clock.IsRunning)clock.Start();
            frames.Enabled=active&&introDecided&&!IsReduced&&(Time<1.8||busy||scanning||transitionStart>=0&&Time<transitionStart+.24);frames.Interval=Time<0.8?40:Time<1.5?16:busy||scanning?33:83;
            progress.Animate=active&&!IsReduced&&(busy||scanning);
            if(IsReduced){elapsed=1.5;clock.Reset();card.Visible=true;skip.Visible=false;progress.Animate=false;Invalidate();}
        }
        async Task Scan(){
            scanning=true;error=false;completed=false;choice=false;removeSelected=false;message="";RefreshPage();
            try{await Task.Run(()=>host.Refresh());if(IsDisposed)return;stamp=host.Stamp;if(host.Current.Directory!="")directory.Input.Text=host.Current.Directory;scanning=false;choice=host.Decision==Decision.Install;transitionStart=Time;RefreshPage();UpdateMotion();}
            catch(Exception){if(IsDisposed)return;scanning=false;error=true;message="Não foi possível consultar os registros do Krono. Nenhum arquivo foi alterado.";RefreshPage();}
        }
        void SelectOperation(bool uninstall){if(busy||scanning)return;removeSelected=uninstall;choice=true;consent.Checked=false;transitionStart=Time;RefreshPage();UpdateMotion();}
        void RequestClose(){if(busy){message="A operação está em andamento. Aguarde a confirmação antes de fechar.";detail.Text=message;}else Close();}
        bool Blocked {get{return host.Decision==Decision.Invalid||host.Decision==Decision.Downgrade;}}
        void RefreshNext(){next.Enabled=!busy&&!scanning&&(completed||error||choice&&(!Blocked||removeSelected&&host.CanRemove)&&(removeSelected?consent.Checked:Policy.ValidDirectory(directory.Input.Text)&&(host.Decision!=Decision.Legacy||consent.Checked)));}
        void RefreshPage(){
            bool existing=host.Decision!=Decision.Install;
            install.Visible=remove.Visible=existing&&!scanning&&!busy&&!completed&&!error;
            install.Enabled=!Blocked;remove.Enabled=host.CanRemove;
            install.Text=(host.Decision==Decision.Update?"Atualizar":"Reinstalar")+(choice&&!removeSelected?"  ✓":"");remove.Text="Desinstalar"+(removeSelected?"  ✓":"");
            install.Primary=remove.Primary=false;install.Selected=choice&&!removeSelected;remove.Selected=removeSelected;
            directory.Visible=pathLabel.Visible=browse.Visible=!scanning&&!busy&&!completed&&!error&&!removeSelected&&!Blocked&&host.Decision!=Decision.Legacy;
            directory.Input.ReadOnly=existing;browse.Enabled=!existing;
            consent.Visible=!scanning&&!busy&&!completed&&!error&&(removeSelected||host.Decision==Decision.Legacy);
            consent.Text=removeSelected?"Confirmo a remoção do aplicativo. Histórico e preferências serão mantidos.":"Entendi: a compilação instalada é desconhecida. Quero reinstalar.";
            progress.Visible=scanning||busy;
            if(scanning){title.Text="Verificando instalação";subtitle.Text="Consultando os registros locais do Krono.";detail.Text="Nenhuma busca nos seus documentos.";next.Text="Verificando…";}
            else if(completed){title.Text=removeSelected?"Krono desinstalado":"Tudo pronto";subtitle.Text=host.Preview?"Simulação concluída. Nenhum aplicativo foi alterado.":removeSelected?"O aplicativo foi removido. Seus registros foram preservados.":rebootRequired?"Os arquivos foram preparados. Reinicie o Windows antes de abrir.":"A instalação foi confirmada. Abra o Krono para começar.";detail.Text=message;next.Text=removeSelected||host.Preview||rebootRequired?"Fechar":"Abrir o Krono  →";}
            else if(busy){title.Text=removeSelected?"Desinstalando":"Preparando o Krono";subtitle.Text="Aguarde a confirmação da operação.";detail.Text=message;next.Text="Em andamento…";}
            else if(error){title.Text="Não foi possível concluir";subtitle.Text=message;detail.Text="Confira a instalação antes de repetir. Uma falha não confirma que todos os arquivos foram substituídos.";next.Text="Verificar novamente";}
            else{
                title.Text=existing?"Krono já está instalado":"Instalar o Krono";
                subtitle.Text=host.Decision==Decision.Invalid?"Os registros existentes não permitem uma operação segura.":host.Decision==Decision.Downgrade?"Há uma versão mais recente. A substituição está bloqueada.":existing?"Escolha o que deseja fazer. Seus registros serão preservados.":"Escolha a pasta. O restante acontece aqui.";
                detail.Text=removeSelected?"Apenas o aplicativo será removido. Não apaga o perfil local.":host.Decision==Decision.Legacy?"Este pacote não pode confirmar se é mais recente que a instalação existente.":existing?"Destino preservado para manter a identidade da instalação.":"Uma pasta local chamada Krono será usada. Funciona offline, sem conta.";
                next.Text=!choice?"Escolha uma opção":removeSelected?"Desinstalar o Krono":host.Decision==Decision.Update?"Atualizar o Krono":existing?"Reinstalar o Krono":"Instalar o Krono";
            }
            version.Text=Identity.Version+(host.Preview?" · PRÉVIA SEM INSTALAÇÃO":"")+(existing&&!scanning?"\nInstalado: "+host.Current.Version:"");
            motion.Visible=!busy;RefreshNext();LayoutContent();card.Invalidate(true);UpdateMotion();
        }
        async Task Forward(){
            if(busy||scanning||!next.Enabled)return;
            if(completed){try{if(!host.Preview&&!removeSelected&&!rebootRequired)host.Open();leaving=true;Close();}catch(Exception){completed=false;error=true;message="A instalação terminou, mas não foi possível abrir o aplicativo.";RefreshPage();}return;}
            if(error){await Scan();return;}
            if(host.AppRunning()){detail.Text=Policy.Error(1618);return;}
            busy=true;message="Verificando o pacote local…";RefreshPage();
            try{
                Action<string> status=text=>{if(!IsDisposed){message=text;detail.Text=text;}};
                int code=removeSelected?await host.Remove(stamp,status):await host.Install(directory.Input.Text,consent.Checked,stamp,status);
                busy=false;rebootRequired=code==3010;completed=code==0||rebootRequired;error=!completed;message=completed?(rebootRequired?"O Windows precisa ser reiniciado para concluir.":""):Policy.Error(code);
            }catch(Exception){busy=false;error=true;message="A operação falhou na preparação ou verificação do pacote. Confira a instalação e tente novamente.";}
            if(!IsDisposed){RefreshPage();next.Focus();}
        }
        void LayoutContent(){
#if KRONO_PREVIEW
            layoutPasses++;
#endif
            float s=DeviceDpi/96f;int w=(int)Math.Min(740*s,ClientSize.Width-80*s),h=(int)(ClientSize.Height-128*s);
            double enter=transitionStart<0?1:Scene.Ease(transitionStart,transitionStart+.24,Time);
            card.SetBounds((ClientSize.Width-w)/2,(int)(88*s+(IsReduced?0:(1-enter)*7*s)),w,h);
            int pad=(int)(24*s),inside=w-pad*2;
            bool choices=host.Decision!=Decision.Install&&!scanning&&!busy&&!completed&&!error;
            bool showDirectory=!scanning&&!busy&&!completed&&!error&&!removeSelected&&!Blocked&&host.Decision!=Decision.Legacy;
            bool showConsent=!scanning&&!busy&&!completed&&!error&&(removeSelected||host.Decision==Decision.Legacy);
            title.SetBounds(pad,(int)(24*s),inside,(int)(44*s));subtitle.SetBounds(pad,(int)(76*s),inside,(int)(44*s));
            install.SetBounds(pad,(int)(126*s),(inside-(int)(12*s))/2,(int)(40*s));remove.SetBounds(pad+install.Width+(int)(12*s),install.Top,install.Width,install.Height);
            pathLabel.SetBounds(pad,(int)((choices?184:144)*s),inside,(int)(20*s));
            directory.SetBounds(pad,pathLabel.Bottom+(int)(6*s),inside-(int)(148*s),(int)(44*s));browse.SetBounds(directory.Right+(int)(12*s),directory.Top,(int)(136*s),directory.Height);
            consent.SetBounds(pad,(int)(184*s),inside,(int)(52*s));
            detail.SetBounds(pad,(int)((showDirectory?directory.Bottom/s+12:showConsent?248:190)*s),inside,(int)(44*s));
            progress.SetBounds(pad,(int)(148*s),inside,(int)(20*s));
            next.SetBounds(w-pad-(int)(186*s),h-(int)(68*s),(int)(186*s),(int)(44*s));version.SetBounds(pad,next.Top,(int)(inside-210*s),(int)(44*s));
            motion.SetBounds(pad,h-(int)(108*s),(int)(190*s),(int)(24*s));
            close.SetBounds(ClientSize.Width-(int)(62*s),(int)(20*s),(int)(34*s),(int)(30*s));minimize.SetBounds(close.Left-(int)(40*s),close.Top,close.Width,close.Height);skip.SetBounds(ClientSize.Width-(int)(210*s),ClientSize.Height-(int)(64*s),(int)(170*s),(int)(32*s));
        }
        protected override void OnPaintBackground(PaintEventArgs e){scene.Paint(e.Graphics,ClientSize,Time,IsReduced,!paused);}
        protected override void WndProc(ref Message m){base.WndProc(ref m);if(m.Msg==0x1A){systemReduced=SystemReduced();UpdateMotion();}if(m.Msg==0x84&&m.Result.ToInt32()==1){var p=PointToClient(new Point(unchecked((short)(long)m.LParam),unchecked((short)((long)m.LParam>>16))));int edge=7*DeviceDpi/96;bool l=p.X<edge,r=p.X>Width-edge,t=p.Y<edge,b=p.Y>Height-edge;if(l||r||t||b)m.Result=new IntPtr(t?(l?13:r?14:12):b?(l?16:r?17:15):l?10:11);}}
        protected override void Dispose(bool disposing){if(disposing){frames.Dispose();scene.Dispose();}base.Dispose(disposing);}
#if KRONO_PREVIEW
        internal async Task ProbeLive(){
            await Task.Delay(150);if(scanning)throw new Exception("Consulta de fixture não terminou");
            if(KeyboardFocus)throw new Exception("Abertura marcou teclado sem entrada");close.PreviewAutomaticFocus();minimize.PreviewAutomaticFocus();if(introAllowed||skip.Visible||Time<1.44)throw new Exception("Manutenção reproduziu abertura");
            using(var other=new Form()){var foreign=Message.Create(other.Handle,0x100,new IntPtr((int)Keys.Tab),IntPtr.Zero);PreFilterMessage(ref foreign);if(KeyboardFocus)throw new Exception("Entrada de outra janela alterou foco");}
            var keyboard=Message.Create(close.Handle,0x100,new IntPtr((int)Keys.Tab),IntPtr.Zero);PreFilterMessage(ref keyboard);if(!KeyboardFocus)throw new Exception("Mensagem de teclado ignorada");
            var pointer=Message.Create(close.Handle,0x201,IntPtr.Zero,IntPtr.Zero);PreFilterMessage(ref pointer);if(KeyboardFocus)throw new Exception("Mensagem de ponteiro manteve anel");
            skip.PerformClick();await Task.Delay(800);if(Time<1.44||!card.Visible)throw new Exception("Skip não chegou à operação");
            SelectOperation(false);install.Focus();for(int i=0;i<20;i++)if(!ProcessDialogKey(Keys.Tab)||!ContainsFocus)throw new Exception("Tab sem foco");for(int i=0;i<10;i++)if(!ProcessDialogKey(Keys.Tab|Keys.Shift)||!ContainsFocus)throw new Exception("Shift+Tab sem foco");
            await Task.Delay(400);int settledLayouts=layoutPasses;await Task.Delay(180);if(layoutPasses!=settledLayouts||frames.Enabled)throw new Exception("Repouso manteve pintura contínua");
            busy=true;RefreshPage();UpdateMotion();await Task.Delay(120);double activityPhase=progress.Phase;await Task.Delay(100);if(!progress.Animate||progress.Phase<=activityPhase)throw new Exception("Atividade não avançou");
            WindowState=FormWindowState.Minimized;await Task.Delay(100);double frozen=Time;await Task.Delay(180);if(frames.Enabled||progress.Animate||Math.Abs(Time-frozen)>.02)throw new Exception("Motion continuou minimizado");
            WindowState=FormWindowState.Normal;await Task.Delay(100);motion.Checked=true;if(frames.Enabled||progress.Animate||Time<1.44)throw new Exception("Redução não cancelou");motion.Checked=false;await Task.Delay(100);if(!frames.Enabled||!clock.IsRunning)throw new Exception("Atividade não retomou");
            Hide();await Task.Delay(150);frozen=Time;await Task.Delay(100);if(frames.Enabled||progress.Animate||Math.Abs(Time-frozen)>.02)throw new Exception("Motion invisível");Show();await Task.Delay(100);if(Time<1.44)throw new Exception("Replay após visibilidade");busy=false;RefreshPage();UpdateMotion();if(progress.Animate)throw new Exception("Atividade continuou após operação");
            SelectOperation(true);consent.Checked=true;SelectOperation(false);if(consent.Checked)throw new Exception("Confirmação reaproveitada");
            var simulated=host as PreviewHost;if(simulated==null)throw new Exception("Live probe sem fixture");simulated.Result=3010;await Forward();if(!rebootRequired||!completed||next.Text!="Fechar")throw new Exception("Reinício exigido tentou abrir app");
        }
        internal void RenderPreview(int page,bool reduce,Size size,string path,bool working,bool failed,bool done){
            ClientSize=size;reduced=reduce;elapsed=page==0?2:1.6;clock.Reset();scanning=page==1;busy=working;error=failed;completed=done;choice=true;removeSelected=page==4;message=working?"SIMULAÇÃO · aguardando mecanismo de teste.":failed?Policy.Error(1618):"";transitionStart=-1;RefreshPage();card.Visible=page!=0;skip.Visible=page==0;Prepare(this);LayoutContent();
            using(var b=new Bitmap(Width,Height)){DrawToBitmap(b,ClientRectangle);b.Save(path,System.Drawing.Imaging.ImageFormat.Png);}
            foreach(var c in new Control[]{title,subtitle,detail,next,version}){if(!card.ClientRectangle.Contains(c.Bounds))throw new Exception("Overflow: "+c.Text);if(c is Label){var measured=TextRenderer.MeasureText(c.Text,c.Font,new Size(c.Width,int.MaxValue),TextFormatFlags.WordBreak|TextFormatFlags.TextBoxControl);if(measured.Height>c.Height+2)throw new Exception("Texto cortado: "+c.Text);}}
            if(host.Decision!=Decision.Install&&!scanning&&!busy&&!completed&&!error&&!removeSelected&&!Blocked&&host.Decision!=Decision.Legacy&&directory.Bounds.IntersectsWith(install.Bounds))throw new Exception("Sobreposição de ações e diretório");
            int inset=(int)(24*DeviceDpi/96f);var safe=new Rectangle(inset,inset,card.Width-2*inset,card.Height-2*inset);
            foreach(var c in new Control[]{title,subtitle,detail,next,version,motion,directory,browse,install,remove,consent})if(!safe.Contains(c.Bounds))throw new Exception("Margem interna insuficiente: "+c.Text);
            if(motion.Bottom+12*DeviceDpi/96>next.Top)throw new Exception("Rodapé sem intervalo de grupo");
        }
        internal void ProbeInteractions(){
            scanning=false;elapsed=1.6;choice=false;completed=error=busy=false;RefreshPage();
            if(host.Decision==Decision.Reinstall){
                if(next.Enabled)throw new Exception("Manutenção sem escolha explícita");
                for(int i=0;i<12;i++){SelectOperation(true);if(next.Enabled)throw new Exception("Remoção sem confirmação");consent.Checked=true;if(!next.Enabled)throw new Exception("Remoção confirmada bloqueada");SelectOperation(false);if(!next.Enabled||consent.Checked)throw new Exception("Troca não limpou consentimento");}
            }
            busy=true;SelectOperation(true);if(removeSelected)throw new Exception("Operação mudou durante execução");busy=false;
            motion.Checked=true;if(Time<1.44||frames.Enabled)throw new Exception("Redução manteve abertura");motion.Checked=false;
            if(string.IsNullOrWhiteSpace(next.Text)||string.IsNullOrWhiteSpace(close.AccessibleName)||string.IsNullOrWhiteSpace(minimize.AccessibleName))throw new Exception("Nome acessível ausente");
        }
        static void Prepare(Control c){var handle=c.Handle;foreach(Control child in c.Controls)Prepare(child);}
#endif
    }
}

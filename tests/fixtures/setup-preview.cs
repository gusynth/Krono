using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Krono.Setup {
    // Compilado separadamente: sem NativeHost, payload, registro ou instalação.
    internal sealed class PreviewHost : IInstallHost {
        public Decision Scenario=Decision.Install;
        public int Result;
        public PreviewHost(){var name=System.Reflection.Assembly.GetExecutingAssembly().Location;if(name.Contains("Legacy"))Scenario=Decision.Legacy;else if(name.Contains("Downgrade"))Scenario=Decision.Downgrade;}
        public Installation Current {get{return Scenario==Decision.Install?new Installation():new Installation{Version="0.1.0",Build=Scenario==Decision.Legacy?"":"3",Directory=@"C:\Exemplo\Krono",Uninstall=@"""C:\Exemplo\Krono\Uninstall Krono.exe"" /currentuser"};}}
        public Decision Decision {get{return Scenario;}}
        public bool Preview {get{return true;}}
        public string Stamp {get{return Policy.Stamp(Current,Scenario);}}
        public bool CanRemove {get{return Policy.CanRemove(Current,Scenario);}}
        public void Refresh(){}
        public bool AppRunning(){return false;}
        public async Task<int> Install(string destination,bool legacy,string stamp,Action<string> status) {status("Simulação explícita da prévia. Nenhum arquivo será instalado.");await Task.Delay(400);return Result;}
        public async Task<int> Remove(string stamp,Action<string> status){status("Simulação de remoção. Nenhum arquivo foi alterado.");await Task.Delay(400);return 0;}
        public void Open(){throw new InvalidOperationException("Prévia não abre aplicativos instalados.");}
    }
    internal static class SelfTests {
        public static int Live(string report){
            Exception failure=null;using(var form=new SetupForm(new PreviewHost{Scenario=Decision.Reinstall})){
                form.Shown+=async(s,e)=>{try{await form.ProbeLive();}catch(Exception ex){failure=ex;}finally{form.Close();}};Application.Run(form);
            }
            if(failure==null)foreach(int mode in new[]{0,1,2})using(var picker=new FolderPicker(Path.Combine(Path.GetDirectoryName(report),"synthetic-folders"),mode==2)){
                picker.Shown+=async(s,e)=>{try{await picker.ProbeLive(Path.Combine(Path.GetDirectoryName(report),mode==2?"folder-reduced-focus.png":mode==1?"folder-cancel-focus.png":"folder-focus.png"),mode==1);}catch(Exception ex){failure=ex;}finally{picker.Close();}};Application.Run(picker);
            }
            File.WriteAllText(report,failure==null?"passed: live isolated preview; skip/dock; Tab x20; Shift+Tab x10; minimize/restore; reduction on/off; hide/show without replay; consent reset; folder corners/focus; finite entry completion/cancel/reduced; folder Tab/Escape. No NativeHost, engine, registry, installed app or audio. Not physical keyboard/UIA/reader/DPI certification.":failure.ToString());return failure==null?0:1;
        }
        static int count;
        static void Check(bool value,string name){if(!value)throw new Exception(name);count++;}
        public static int Run(string output) {
            foreach(Decision decision in Enum.GetValues(typeof(Decision))) {
                Check(Policy.PlayIntroduction(decision,false)==(decision==Decision.Install),"Introduction only for clean install");
                Check(!Policy.PlayIntroduction(decision,true),"No introduction after detection failure");
            }
            Check(Policy.InstallDestination(@"C:\Programs")==@"C:\Programs\Krono","Append Krono destination");
            Check(Policy.InstallDestination(@"C:\Programs\Krono")==@"C:\Programs\Krono","Do not duplicate Krono");
            try {
                var values=new[]{"", Identity.Version, "2.0.0", "0.0.9", "0.01.0", "0.1", "65536.0.0", "0.1.0-beta", "invalid", " 0.1.0", "0..1", "0.1.0.0"};
                foreach(var v in values)foreach(var b in new[]{"","0","1","2","3","4","65535","65536","01","-1","abc"}){
                    int parsed;Decision d=Policy.Classify(v,b,Identity.Version,Identity.Build);
                    Check(Enum.IsDefined(typeof(Decision),d),"enum");
                    if(v==Identity.Version&&b=="")Check(d==Decision.Legacy,"legacy");
                    if(v==Identity.Version&&b==Identity.Build)Check(d==Decision.Reinstall,"same");
                    if(v==Identity.Version&&int.TryParse(b,out parsed)&&parsed>int.Parse(Identity.Build)&&parsed<=65535)Check(d==Decision.Downgrade,"newer build");
                    if(v==Identity.Version&&int.TryParse(b,out parsed)&&parsed>0&&parsed<int.Parse(Identity.Build)&&b[0]!='0')Check(d==Decision.Update,"older build");
                }
                Check(Policy.Classify("","",Identity.Version,Identity.Build)==Decision.Install,"clean");
                Check(Policy.Classify(Identity.Version,Identity.Build,Identity.Version,Identity.Build)==Decision.Reinstall,"exact candidate reinstall");
                Check(Policy.Classify("1.3.0","21",Identity.Version,Identity.Build)==Decision.Update,"public 1.3.0 updates to candidate");
                Check(Policy.Classify("1.3.1","25",Identity.Version,Identity.Build)==Decision.Update,"stable 1.3.1 updates to candidate");
                Check(Policy.Classify(Identity.Version,(int.Parse(Identity.Build)+1).ToString(),Identity.Version,Identity.Build)==Decision.Downgrade,"next build blocked");
                Check(Policy.Classify("2.0.0","1",Identity.Version,Identity.Build)==Decision.Downgrade,"newer version");
                Check(Policy.Classify("0.0.9","",Identity.Version,Identity.Build)==Decision.Update,"older version");
                Check(Policy.Classify("","1",Identity.Version,Identity.Build)==Decision.Invalid,"orphan");
                foreach(var p in new[]{"C:\\Apps\\Krono", "C:\\Users\\Teste\\Programs\\Krono"})Check(Policy.ValidDirectory(p),"valid path");
                foreach(var p in new[]{"", "C:\\", "relative\\Krono", "\\\\server\\Krono", "C:\\x\" /S\\Krono", "C:\\x\n\\Krono", "C:\\Other"})Check(!Policy.ValidDirectory(p),"invalid path");
                foreach(Decision a in Enum.GetValues(typeof(Decision)))foreach(Decision b in Enum.GetValues(typeof(Decision))){
                    var d=Policy.Combine(new Installation{Decision=a},new Installation{Decision=b});
                    Check(d==Policy.Combine(new Installation{Decision=b},new Installation{Decision=a}),"symmetric");
                    if(a==Decision.Downgrade||b==Decision.Downgrade)Check(d==Decision.Downgrade,"downgrade wins");
                }
                foreach(Decision d in Enum.GetValues(typeof(Decision))){
                    var i=new Installation{Version="0.1.0",Build="4",Directory=@"C:\Apps\Krono",Uninstall=@"""C:\Apps\Krono\Uninstall Krono.exe"" /currentuser"};
                    Check(Policy.CanRemove(i,d)==(d!=Decision.Install&&d!=Decision.Invalid),"remove policy");
                    string before=Policy.Stamp(i,d);i.Build="5";Check(Policy.Stamp(i,d)!=before,"changed stamp");
                    i.Uninstall=@"""C:\Other\remove.exe"" /currentuser";Check(!Policy.CanRemove(i,d),"foreign uninstaller refused");
                    i.Uninstall=@"""C:\Apps\Krono\Uninstall Krono.exe"" /currentuser /evil";Check(!Policy.CanRemove(i,d),"extra arguments refused");
                }
                var start=Scene.LogoBox(.7,false);var mid=Scene.LogoBox(1.1,false);var end=Scene.LogoBox(1.5,false);
                Check(start.X>mid.X&&mid.X>end.X&&start.Width>mid.Width&&mid.Width>end.Width,"continuous dock");
                Check(Scene.LogoBox(0,true)==end,"reduced dock immediately");
                Check(Scene.Ease(1,2,.9)==0&&Scene.Ease(1,2,2.1)==1,"motion endpoints");
                using(var form=new SetupForm(new PreviewHost{Scenario=Decision.Reinstall}))form.ProbeInteractions();
                int renders=0;
                if(output!=null){
                    Directory.CreateDirectory(output);
                    foreach(var size in new[]{new Size(1000,660),new Size(820,560),new Size(720,560)})foreach(var scenario in new[]{Decision.Install,Decision.Legacy,Decision.Downgrade,Decision.Update,Decision.Reinstall,Decision.Invalid})foreach(bool reduce in new[]{false,true}){
                        using(var form=new SetupForm(new PreviewHost{Scenario=scenario}))for(int page=0;page<5;page++){
                            form.RenderPreview(page,reduce,size,Path.Combine(output,"view-"+scenario+"-"+size.Width+"x"+size.Height+"-"+page+"-"+reduce+".png"),false,false,false);renders++;
                        }
                    }
                    foreach(var size in new[]{new Size(1000,660),new Size(700,540)})using(var form=new SetupForm(new PreviewHost())){
                        form.RenderPreview(3,true,size,Path.Combine(output,"busy-"+size.Width+".png"),true,false,false);renders++;
                        form.RenderPreview(3,true,size,Path.Combine(output,"error-"+size.Width+".png"),false,true,false);renders++;
                        form.RenderPreview(3,true,size,Path.Combine(output,"complete-"+size.Width+".png"),false,false,true);renders++;
                    }
                    string folders=Path.Combine(output,"synthetic-folders");Directory.CreateDirectory(folders);for(int i=0;i<9;i++)Directory.CreateDirectory(Path.Combine(folders,"Pasta "+i));
                    using(var picker=new FolderPicker(folders))picker.RenderPreview(Path.Combine(output,"folder-picker.png"));
                    var watch=new System.Diagnostics.Stopwatch();var times=new List<double>();
                    using(var renderer=new Scene())using(var bitmap=new Bitmap(840,600))using(var graphics=Graphics.FromImage(bitmap)){
                        foreach(double seconds in new[]{0,.3,.7,1.1,1.5,30.0}){renderer.Paint(graphics,new Size(820,560),seconds,false,true);bitmap.Save(Path.Combine(output,"motion-"+seconds.ToString("0.0",System.Globalization.CultureInfo.InvariantCulture)+".png"));}
                        for(int i=0;i<120;i++){watch.Restart();renderer.Paint(graphics,new Size(820,560),i/80.0,false,true);watch.Stop();times.Add(watch.Elapsed.TotalMilliseconds);}times.Sort();
                    }
                    var idle=new List<double>();using(var renderer=new Scene())using(var bitmap=new Bitmap(840,600))using(var graphics=Graphics.FromImage(bitmap))for(int i=0;i<60;i++){watch.Restart();renderer.Paint(graphics,new Size(820,560),30+i/12.0,false,true);watch.Stop();idle.Add(watch.Elapsed.TotalMilliseconds);}idle.Sort();
                    File.WriteAllText(Path.Combine(output,"motion-cost.txt"),"GDI+ offscreen 840x600; intro 120 draws p50="+times[60]+"ms p95="+times[114]+"ms; idle 60 draws p50="+idle[30]+"ms p95="+idle[57]+"ms. Does not certify interactive frame times, CPU, DPI or audio.");
                    File.WriteAllText(Path.Combine(output,"policy.txt"),"passed: "+count+" policy assertions; "+renders+" layout renders; isolated preview has no NativeHost or payload");
                }
                Console.WriteLine("passed: "+count);return 0;
            }catch(Exception ex){if(output!=null){Directory.CreateDirectory(output);File.WriteAllText(Path.Combine(output,"policy.txt"),ex.ToString());}return 1;}
        }
    }
}

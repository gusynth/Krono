using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Krono.Setup {
    internal static class Program {
        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
        [STAThread] static int Main(string[] args) {
            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
#if KRONO_PREVIEW
            if(args.Length>0&&args[0]=="--folder-preview"){Application.Run(new FolderPicker(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-tests","synthetic-folders")));return 0;}
            if(args.Length>1&&args[0]=="--live-test")return SelfTests.Live(args[1]);
            if(args.Length>0&&args[0]=="--self-test") return SelfTests.Run(args.Length>1?args[1]:null);
            Application.Run(new SetupForm(new PreviewHost()));
#else
            // Não interpretar argumentos como comandos de instalação, caminhos ou URLs.
            bool created;
            using(var mutex=new System.Threading.Mutex(true,"Local\\Krono.Setup.Experience",out created)) {
                if(!created)return 1618;
                IInstallHost host;
                try { host=new NativeHost(); } catch(System.Security.SecurityException) { host=new BlockedHost(); } catch(UnauthorizedAccessException) {host=new BlockedHost();}
                Application.Run(new SetupForm(host));
            }
#endif
            return 0;
        }
    }
    internal sealed class BlockedHost : IInstallHost {
        public Installation Current {get{return new Installation();}}
        public Decision Decision {get{return Decision.Invalid;}}
        public bool Preview {get{return false;}}
        public string Stamp {get{return "blocked";}}
        public bool CanRemove {get{return false;}}
        public void Refresh(){} public bool AppRunning(){return false;}
        public System.Threading.Tasks.Task<int> Install(string destination,bool legacy,string stamp,Action<string> status){return System.Threading.Tasks.Task.FromResult(13);}
        public System.Threading.Tasks.Task<int> Remove(string stamp,Action<string> status){return System.Threading.Tasks.Task.FromResult(13);}
        public void Open(){throw new InvalidOperationException("Instalação não confirmada.");}
    }
}

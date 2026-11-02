using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace Krono.Setup {
    internal sealed class NativeHost : IInstallHost {
        const string Key = Identity.InstallKey;
        const string Uninstall = Identity.UninstallKey;
        Installation user, machine;
        public Installation Current { get; private set; }
        public Decision Decision { get; private set; }
        public bool Preview { get { return false; } }
        public string Stamp {get{return Policy.Stamp(Current,Decision);}}
        public bool CanRemove {get{return Policy.CanRemove(Current,Decision);}}
        public NativeHost() { Current=new Installation(); }
        Installation Read(RegistryHive hive) {
            var i = new Installation { Machine = hive == RegistryHive.LocalMachine };
            using (var root = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64))
            using (var install = root.OpenSubKey(Key, false))
            using (var uninstall = root.OpenSubKey(Uninstall, false)) {
                i.Version = Convert.ToString(uninstall == null ? null : uninstall.GetValue("DisplayVersion", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                i.Build = Convert.ToString(install == null ? null : install.GetValue("KronoBuild", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                i.Directory = Convert.ToString(install == null ? null : install.GetValue("InstallLocation", null, RegistryValueOptions.DoNotExpandEnvironmentNames));
                i.Uninstall=Convert.ToString(uninstall==null?null:uninstall.GetValue("UninstallString",null,RegistryValueOptions.DoNotExpandEnvironmentNames));
                if (i.Version == "" && (i.Directory != "" || (uninstall != null && Convert.ToString(uninstall.GetValue("UninstallString")) != ""))) i.Version = "invalid";
                i.Decision = Policy.Classify(i.Version, i.Build, Identity.Version, Identity.Build);
                if(i.Version!=""&&i.Directory=="")i.Decision=Decision.Invalid;
            }
            return i;
        }
        public void Refresh() {
            user = Read(RegistryHive.CurrentUser); machine = Read(RegistryHive.LocalMachine);
            Decision = Policy.Combine(user, machine);
            // Não selecionar silenciosamente um escopo quando há duas instalações.
            if (user.Decision != Decision.Install && machine.Decision != Decision.Install) Decision = Decision.Invalid;
            Current = machine.Decision != Decision.Install ? machine : user;
        }
        public bool AppRunning() { var processes=Process.GetProcessesByName("Krono");bool running=processes.Length>0;foreach(var p in processes)p.Dispose();return running; }
        public async Task<int> Install(string destination, bool legacy, string stamp, Action<string> status) {
            Refresh();
            if(Stamp!=stamp)return 1706;
            if (Decision == Decision.Downgrade) return 1638;
            if (Decision == Decision.Invalid || (Decision == Decision.Legacy && !legacy)) return 13;
            if (AppRunning()) return 1618;
            if (!Policy.ValidDirectory(destination)||!SafeTree(destination,true)) return 87;
            if(Decision==Decision.Install&&Directory.Exists(destination)&&Directory.EnumerateFileSystemEntries(destination).Any())return 183;
            if (Current.Directory != "" && !Path.GetFullPath(Current.Directory).TrimEnd('\\').Equals(Path.GetFullPath(destination).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) return 87;
            string temp = Path.Combine(Path.GetTempPath(), "Krono.Setup." + Guid.NewGuid().ToString("N"));
            // ACL própria antes de extrair; nunca herdar uma pasta compartilhada gravável.
            var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            Directory.CreateDirectory(temp, security);
            try {
                string backend = Path.Combine(temp, "Krono.Engine.exe");
                status("Preparando e verificando os arquivos locais…");
                await Task.Run(() => {
                    using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream("engine"))
                    using (var output = new FileStream(backend, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                        if (input == null) throw new InvalidDataException("Pacote interno ausente.");
                        input.CopyTo(output, 1024 * 1024);
                    }
                    using (var sha = SHA256.Create()) using (var stream = File.OpenRead(backend)) {
                        string hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                        if (hash != Identity.EngineSha256) throw new InvalidDataException("O pacote interno falhou na verificação de integridade.");
                    }
                });
                Refresh();if(Stamp!=stamp)return 1706;if(AppRunning())return 1618;
                int installerResult=0;
                using (var consent = new Consent()) {
                    Task serve = legacy?consent.Serve(true):Task.FromResult(0);
                    // /D é o último argumento do NSIS, sem aspas, conforme seu contrato.
                    var start = new ProcessStartInfo(backend, "/S " + (Current.Machine ? "/allusers" : "/currentuser") + " /KRONO_UI_PIPE=" + consent.Nonce + " /D=" + destination) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = temp };
                    status("Instalando o Krono… Aguarde a confirmação do instalador.");
                    using (var child = Process.Start(start)) {
                        if (child == null) throw new IOException("O mecanismo de instalação não iniciou.");
                        await Task.Run(() => child.WaitForExit());
                        int result = child.ExitCode;
                        installerResult=result;
                        if (result != 0 && result != 3010) return result;
                        if(serve.IsFaulted)throw new IOException("Não foi possível confirmar o canal de reinstalação.",serve.Exception);
                    }
                }
                Refresh();
                if (Decision!=Decision.Reinstall || Current.Version != Identity.Version || Current.Build != Identity.Build || !File.Exists(Path.Combine(Current.Directory, "Krono.exe")) || !Path.GetFullPath(Current.Directory).TrimEnd('\\').Equals(Path.GetFullPath(destination).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)) return 13;
                return installerResult;
            } finally {
                // Somente os arquivos com nomes fixos da pasta exclusiva desta execução.
                try { File.Delete(Path.Combine(temp, "Krono.Engine.exe")); Directory.Delete(temp, false); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            }
        }
        // Verifica o alvo absoluto antes de entregar remoção recursiva ao NSIS.
        // Não segue junctions/symlinks e não aceita o diretório de dados do app.
        internal static bool SafeTree(string destination,bool recursive){
            if(!Policy.ValidDirectory(destination))return false;
            var full=Path.GetFullPath(destination).TrimEnd('\\');
            foreach(var root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}){
                if(full.Equals(Path.Combine(root,"Krono"),StringComparison.OrdinalIgnoreCase))return false;
            }
            for(var p=new DirectoryInfo(full);p!=null;p=p.Parent)if(p.Exists&&(p.Attributes&FileAttributes.ReparsePoint)!=0)return false;
            if(recursive&&Directory.Exists(full)){
                var pending=new System.Collections.Generic.Stack<string>();pending.Push(full);
                while(pending.Count>0)foreach(string child in Directory.EnumerateFileSystemEntries(pending.Pop())){
                    var attributes=File.GetAttributes(child);if((attributes&FileAttributes.ReparsePoint)!=0)return false;
                    if((attributes&FileAttributes.Directory)!=0)pending.Push(child);
                }
            }
            return true;
        }
        public async Task<int> Remove(string stamp,Action<string> status){
            Refresh();if(Stamp!=stamp)return 1706;if(!CanRemove)return 13;if(AppRunning())return 1618;
            string destination=Path.GetFullPath(Current.Directory).TrimEnd('\\');
            if(!SafeTree(destination,true))return 87;
            var exe=Path.Combine(destination,"Krono.exe");
            if(!File.Exists(exe)||!File.Exists(Path.Combine(destination,"resources","app.asar"))||FileVersionInfo.GetVersionInfo(exe).ProductName!="Krono")return 13;
            string temp=Path.Combine(Path.GetTempPath(),"Krono.Remove."+Guid.NewGuid().ToString("N"));
            var security=new DirectorySecurity();security.SetAccessRuleProtection(true,false);security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.CreateDirectory(temp,security);
            try{
                string backend=Path.Combine(temp,"Krono.Remove.exe");status("Verificando o mecanismo de remoção local…");
                await Task.Run(()=>{using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("remove-engine"))using(var output=new FileStream(backend,FileMode.CreateNew,FileAccess.Write,FileShare.None)){if(input==null)throw new InvalidDataException();input.CopyTo(output);}using(var sha=SHA256.Create())using(var stream=File.OpenRead(backend))if(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant()!=Identity.RemoveSha256)throw new InvalidDataException("Mecanismo de remoção inválido.");});
                Refresh();if(Stamp!=stamp)return 1706;if(AppRunning())return 1618;if(!SafeTree(destination,true))return 87;
                // _?= impede o stub de se destacar: aguardamos o processo real.
                var start=new ProcessStartInfo(backend,"/S /"+(Current.Machine?"allusers":"currentuser")+" _?="+destination){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=temp};
                status("Removendo somente os arquivos do aplicativo…");
                int result;using(var child=Process.Start(start)){if(child==null)throw new IOException();await Task.Run(()=>child.WaitForExit());result=child.ExitCode;}
                if(result!=0&&result!=3010)return result;
                Refresh();if(Decision!=Decision.Install||File.Exists(exe))return 13;
                return result;
            }finally{try{File.Delete(Path.Combine(temp,"Krono.Remove.exe"));Directory.Delete(temp,false);}catch(IOException){}catch(UnauthorizedAccessException){}}
        }
        public void Open() {
            Refresh();
            if (Current.Version != Identity.Version || Current.Build != Identity.Build || !Policy.ValidDirectory(Current.Directory)) throw new InvalidDataException("A instalação não foi confirmada.");
            var path = Path.Combine(Current.Directory, "Krono.exe");
            if (!File.Exists(path)) throw new FileNotFoundException("O executável instalado não foi encontrado.");
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true, WorkingDirectory = Current.Directory });
        }
    }
}

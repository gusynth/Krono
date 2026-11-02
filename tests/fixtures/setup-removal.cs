using System;
using System.Diagnostics;
using System.IO;
class RemovalTest {
    static void Run(string exe,string arguments,int expected){using(var p=Process.Start(new ProcessStartInfo(exe,arguments){UseShellExecute=false,CreateNoWindow=true})){if(!p.WaitForExit(10000)){p.Kill();throw new Exception("Fixture removal hung");}if(p.ExitCode!=expected)throw new Exception("Exit "+p.ExitCode+", expected "+expected);}}
    static int Main(string[] args){try{
        string target=Path.GetFullPath(args[2]);if(!target.StartsWith(Path.GetDirectoryName(Path.GetFullPath(args[0]))+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(target)!="Krono")throw new Exception("Fixture outside test directory");
        Directory.CreateDirectory(target);string payload=Path.Combine(target,"synthetic.txt"),profile=Path.Combine(Path.GetDirectoryName(target),"synthetic-profile.txt");File.WriteAllText(payload,"original");File.WriteAllText(profile,"preserved");
        Run(args[0],"/S",0);
        Run(args[1],"/S _?="+Path.GetDirectoryName(target),87);
        using(var held=new FileStream(payload,FileMode.Open,FileAccess.ReadWrite,FileShare.None))Run(args[1],"/S _?="+target,1603);
        if(File.ReadAllText(payload)!="original")throw new Exception("Locked file changed");
        Run(args[1],"/S _?="+target,0);
        if(Directory.Exists(target)||File.ReadAllText(profile)!="preserved")throw new Exception("Removal or preservation failed");
        Directory.CreateDirectory(target);File.WriteAllText(payload,"parent-cwd");
        string originalDirectory=Environment.CurrentDirectory;
        try {
            Environment.CurrentDirectory=target;
            Run(args[1],"/S _?="+target,1603);
            if(File.Exists(payload)||!Directory.Exists(target))throw new Exception("Parent CWD failure not reproduced");
        } finally { Environment.CurrentDirectory=originalDirectory; }
        File.WriteAllText(payload,"released-cwd");
        Run(args[1],"/S _?="+target,0);
        if(Directory.Exists(target)||File.ReadAllText(profile)!="preserved")throw new Exception("Released parent CWD did not resolve removal");
        File.WriteAllText(args[3],"passed: wrong target refused; locked file exits 1603; parent CWD reproduces 1603 after file removal; releasing parent CWD permits removal; real uninstaller awaited; external synthetic profile preserved; no registry/application installation");return 0;
    }catch(Exception ex){File.WriteAllText(args[3],ex.ToString());return 1;}}
}

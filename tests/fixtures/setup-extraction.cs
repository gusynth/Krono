using System;
using System.Diagnostics;
using System.IO;
class ExtractionTest {
    static void Run(string exe,int expected){using(var p=Process.Start(new ProcessStartInfo(exe,"/S"){UseShellExecute=false,CreateNoWindow=true})){
        if(!p.WaitForExit(15000)){p.Kill();throw new Exception("Extraction hung");}if(p.ExitCode!=expected)throw new Exception("Unexpected exit "+p.ExitCode+", expected "+expected);
    }}
    static int Main(string[] args){try{
        File.WriteAllText(args[1],"original");
        using(var held=new FileStream(args[1],FileMode.Open,FileAccess.ReadWrite,FileShare.None))Run(args[0],1603);
        if(File.ReadAllText(args[1])!="original")throw new Exception("Locked destination changed");
        Run(args[0],0);
        if(File.ReadAllText(args[1])!="replacement")throw new Exception("Unlocked copy failed");
        File.WriteAllText(args[2],"passed: locked copy exits 1603 and preserves original; unlocked copy succeeds; no installation/registry");return 0;
    }catch(Exception ex){File.WriteAllText(args[2],ex.ToString());return 1;}}
}

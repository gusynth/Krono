using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
namespace Krono.Setup {
    static class ConsentTests {
        static int Run(string exe,string args,int expected) {
            using(var p=Process.Start(new ProcessStartInfo(exe,args){UseShellExecute=false,CreateNoWindow=true})){
                if(!p.WaitForExit(15000))throw new Exception("Protocol timeout");
                if(p.ExitCode!=expected)throw new Exception("Expected "+expected+" got "+p.ExitCode+" "+args);
                return 1;
            }
        }
        static int Main(string[] args) {
            try{
                int cases=0;
                cases+=Run(args[0],"",13);
                cases+=Run(args[0],"/KRONO_UI_PIPE=../unsafe",13);
                using(var pipe=new Consent()){
                    var serve=pipe.Serve(false);
                    cases+=Run(args[0],"/KRONO_UI_PIPE="+pipe.Nonce,13);
                    if(!serve.Wait(3000))throw new Exception("Denied pipe pending");
                }
                using(var pipe=new Consent()){
                    var serve=pipe.Serve(true);
                    cases+=Run(args[0],"/KRONO_UI_PIPE="+pipe.Nonce,0);
                    if(!serve.Wait(3000))throw new Exception("Accepted pipe pending");
                }
                // Resposta incorreta não pode ser interpretada como consentimento.
                string nonce=Guid.NewGuid().ToString("N");
                using(var pipe=new NamedPipeServerStream("Krono.Setup."+nonce,PipeDirection.InOut,1,PipeTransmissionMode.Message,PipeOptions.Asynchronous)){
                    var serve=Task.Run(async()=>{await pipe.WaitForConnectionAsync();var b=new byte[512];await pipe.ReadAsync(b,0,b.Length);var reply=Encoding.Unicode.GetBytes("accepted:"+Identity.Version+":"+(int.Parse(Identity.Build)+1)+"\0");await pipe.WriteAsync(reply,0,reply.Length);});
                    cases+=Run(args[0],"/KRONO_UI_PIPE="+nonce,13);
                    if(!serve.Wait(3000))throw new Exception("Mismatch pipe pending");
                }
                File.WriteAllText(args[1],"passed: "+cases+" real NSIS/C# pipe cases; no installer/registry");return 0;
            }catch(Exception ex){File.WriteAllText(args[1],ex.ToString());return 1;}
        }
    }
}

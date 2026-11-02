// Opt-in: compilar com NativeHost/Policy/Consent/Identity e recursos reais.
// Nunca executar no host ou incluir no produto.
using System;
using System.IO;
using System.Threading.Tasks;
namespace Krono.Setup {
    internal static class InstalledTest {
        static int Main(string[] args) {
            if(Environment.UserName!="WDAGUtilityAccount" || Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)!=@"C:\Users\WDAGUtilityAccount")return 87;
            try { return Run(args).GetAwaiter().GetResult(); }
            catch(Exception error){Console.Error.WriteLine(error);return 1;}
        }
        static async Task<int> Run(string[] args) {
            var host=new NativeHost();host.Refresh();
            Console.WriteLine("before="+host.Decision+";build="+host.Current.Build);
            int result;
            if(args.Length==1 && args[0]=="remove")result=await host.Remove(host.Stamp,Console.WriteLine);
            else if(args.Length==1 && args[0]=="install") {
                string destination=host.Current.Directory;
                if(destination=="")destination=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Krono");
                result=await host.Install(destination,false,host.Stamp,Console.WriteLine);
            } else return 87;
            host.Refresh();Console.WriteLine("result="+result+";after="+host.Decision+";build="+host.Current.Build);
            return result;
        }
    }
}

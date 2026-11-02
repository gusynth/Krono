using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
class SetupPackageProbe {
    static string Hash(Stream s){using(s)using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(s)).Replace("-", "").ToLowerInvariant();}
    static int Main(string[] args){
        try{
            var assembly=Assembly.LoadFile(Path.GetFullPath(args[0]));
            if(assembly.GetType("Krono.Setup.NativeHost")==null || assembly.GetType("Krono.Setup.PreviewHost")!=null || assembly.GetType("Krono.Setup.SelfTests")!=null)throw new Exception("Wrong production types");
            var form=assembly.GetType("Krono.Setup.SetupForm");
            if(form.GetMethod("RenderPreview",BindingFlags.Instance|BindingFlags.NonPublic)!=null)throw new Exception("Preview method shipped");
            var identity=assembly.GetType("Krono.Setup.Identity");
            if(identity==null || (string)identity.GetField("EngineSha256").GetRawConstantValue()!=args[1] || (string)identity.GetField("RemoveSha256").GetRawConstantValue()!=args[2])throw new Exception("Production verification constants mismatch");
            string hash=Hash(assembly.GetManifestResourceStream("engine"));
            if(hash!=args[1])throw new Exception("Engine digest mismatch");
            if(Hash(assembly.GetManifestResourceStream("remove-engine"))!=args[2])throw new Exception("Remove engine digest mismatch");
            foreach(string legacy in new[]{"intro","background","storyboard","arrival"})if(assembly.GetManifestResourceStream(legacy)!=null)throw new Exception("Legacy asset shipped: "+legacy);
            if(Hash(assembly.GetManifestResourceStream("logo"))!=args[3])throw new Exception("Editorial mark digest mismatch");
            using(var license=assembly.GetManifestResourceStream("font-license"))if(license==null||license.Length<100)throw new Exception("Missing font license");
            Console.WriteLine("passed: install/remove engine digests, editorial mark; no legacy media, font license, production host; no preview hooks");return 0;
        }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
    }
}

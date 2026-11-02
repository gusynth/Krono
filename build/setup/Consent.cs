using System;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;

namespace Krono.Setup {
    // Canal local efêmero, escopo do usuário, uma conexão e contrato fixo por build.
    internal sealed class Consent : IDisposable {
        readonly NamedPipeServerStream pipe;
        public readonly string Nonce = Guid.NewGuid().ToString("N");
        public Consent() {
            var acl = new PipeSecurity();
            acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
            pipe = new NamedPipeServerStream("Krono.Setup." + Nonce, PipeDirection.InOut, 1, PipeTransmissionMode.Message, PipeOptions.Asynchronous, 1024, 1024, acl);
        }
        public async Task Serve(bool accepted) {
            try {
                await pipe.WaitForConnectionAsync();
                var buffer = new byte[512]; int count = await pipe.ReadAsync(buffer, 0, buffer.Length);
                string request = Encoding.Unicode.GetString(buffer, 0, count).TrimEnd('\0');
                string reply = accepted && request == "legacy:" + Identity.Version + ":" + Identity.Build ? "accepted:" + Identity.Version + ":" + Identity.Build : "denied";
                var bytes = Encoding.Unicode.GetBytes(reply + "\0");
                await pipe.WriteAsync(bytes, 0, bytes.Length);
                await pipe.FlushAsync();
            } catch (ObjectDisposedException) { } catch (System.IO.IOException) { }
        }
        public void Dispose() { pipe.Dispose(); }
    }
}

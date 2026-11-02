using System;
using System.IO;
using System.Linq;

namespace Krono.Setup {
    internal enum Decision { Install, Update, Reinstall, Legacy, Downgrade, Invalid }
    internal sealed class Installation {
        public string Version = "", Build = "", Directory = "", Uninstall = "";
        public bool Machine = false;
        public Decision Decision;
    }
    internal static class Policy {
        public static string Stamp(Installation i,Decision decision){return decision+"|"+i.Machine+"|"+i.Version+"|"+i.Build+"|"+i.Directory+"|"+i.Uninstall;}
        public static bool CanRemove(Installation i,Decision decision){
            if(decision==Decision.Install||decision==Decision.Invalid||!ValidDirectory(i.Directory))return false;
            string expected=Path.Combine(i.Directory,"Uninstall Krono.exe");
            return i.Uninstall.Equals("\""+expected+"\" /"+(i.Machine?"allusers":"currentuser"),StringComparison.OrdinalIgnoreCase)||i.Uninstall.Equals("\""+expected+"\"",StringComparison.OrdinalIgnoreCase);
        }
        static int[] Parse(string value, int count, bool positive) {
            if (value == null) return null;
            var parts = value.Split('.');
            if (parts.Length != count) return null;
            var result = new int[count];
            for (int i = 0; i < count; i++) {
                var p = parts[i];
                if (p.Length == 0 || p.Length > 5 || (p.Length > 1 && p[0] == '0') || p.Any(c => c < '0' || c > '9') || !int.TryParse(p, out result[i]) || result[i] > 65535 || (positive && result[i] == 0)) return null;
            }
            return result;
        }
        public static Decision Classify(string version, string build, string candidate, string ordinal) {
            var c = Parse(candidate, 3, false); var cb = Parse(ordinal, 1, true);
            if (c == null || cb == null) return Decision.Invalid;
            var b = string.IsNullOrEmpty(build) ? null : Parse(build, 1, true);
            if (!string.IsNullOrEmpty(build) && (b == null || string.IsNullOrEmpty(version))) return Decision.Invalid;
            if (string.IsNullOrEmpty(version)) return Decision.Install;
            var v = Parse(version, 3, false); if (v == null) return Decision.Invalid;
            for (int i = 0; i < 3; i++) { if (v[i] > c[i]) return Decision.Downgrade; if (v[i] < c[i]) return Decision.Update; }
            if (b == null) return Decision.Legacy;
            return b[0] > cb[0] ? Decision.Downgrade : b[0] < cb[0] ? Decision.Update : Decision.Reinstall;
        }
        public static Decision Combine(Installation user, Installation machine) {
            var decisions = new[] { user.Decision, machine.Decision };
            foreach (var d in new[] { Decision.Downgrade, Decision.Invalid, Decision.Legacy, Decision.Update, Decision.Reinstall }) if (decisions.Contains(d)) return d;
            return Decision.Install;
        }
        public static bool ValidDirectory(string path) {
            try {
                if (string.IsNullOrWhiteSpace(path) || path.IndexOfAny(new[] {'"', '\r', '\n', '\0'}) >= 0 || !Path.IsPathRooted(path) || path.StartsWith("\\\\", StringComparison.Ordinal)) return false;
                var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
                return full.Length > Path.GetPathRoot(full).Length && Path.GetFileName(full).Equals("Krono", StringComparison.OrdinalIgnoreCase);
            } catch (ArgumentException) { return false; } catch (NotSupportedException) { return false; } catch (PathTooLongException) { return false; }
        }
        public static string InstallDestination(string selected) {
            var full=Path.GetFullPath(selected).TrimEnd(Path.DirectorySeparatorChar);
            return Path.GetFileName(full).Equals("Krono",StringComparison.OrdinalIgnoreCase)?full:Path.Combine(full,"Krono");
        }
        public static bool PlayIntroduction(Decision decision,bool failed){return !failed&&decision==Decision.Install;}
        public static string Error(int code) {
            switch(code) {
                case 13: return "Não foi possível confirmar a instalação anterior. Nenhuma conclusão foi confirmada. Confira a versão e seu backup antes de tentar novamente.";
                case 1638: return "Uma versão mais recente já está instalada. Este pacote não pode substituí-la.";
                case 1618: return "Feche o Krono pelo menu da bandeja e tente novamente. O instalador não encerra sua sessão à força.";
                case 1223: return "A autorização do Windows foi cancelada. A instalação não foi concluída.";
                case 87: return "O destino de instalação não é válido. Use uma pasta local chamada Krono e preserve o destino de uma instalação existente.";
                case 183: return "A pasta escolhida já contém arquivos e não foi identificada como uma instalação do Krono. Escolha uma pasta vazia.";
                case 1706: return "A instalação mudou desde a verificação. Confira novamente antes de continuar.";
                case 1603: return "Não foi possível substituir ou remover todos os arquivos. Confira espaço livre, permissões e arquivos em uso antes de tentar novamente.";
                default: return "O instalador não concluiu a operação (código " + code + "). Seus dados não serão apagados por este assistente. Confira o aplicativo antes de tentar novamente.";
            }
        }
    }
}

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace Krono.Setup {
    // Selo editorial: um único asset, fundo estático e revelação finita.
    internal sealed class Scene : IDisposable {
        readonly Image logo;
        readonly Font name=Material.Title(19);
        public Scene(){
            using(var original=Material.Image("logo")){
                var prepared=new Bitmap(512,512,PixelFormat.Format32bppPArgb);
                using(var g=Graphics.FromImage(prepared)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(original,0,0,512,512);}
                logo=prepared;
            }
        }
        internal static double Ease(double from,double to,double t){double p=Math.Max(0,Math.Min(1,(t-from)/(to-from)));return p*p*(3-2*p);}
        internal static RectangleF LogoBox(double seconds,bool reduced){
            double dock=reduced?1:Ease(.8,1.44,seconds);
            return new RectangleF((float)(270+(34-270)*dock),(float)(140+(16-140)*dock),(float)(180+(44-180)*dock),(float)(180+(44-180)*dock));
        }
        public void Paint(Graphics g,Size size,double seconds,bool reduced,bool animate){
            bool hc=SystemInformation.HighContrast;
            g.Clear(hc?SystemColors.Window:Material.Canvas);
            g.SmoothingMode=SmoothingMode.AntiAlias;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
            float sx=size.Width/720f,sy=size.Height/480f;
            var box=LogoBox(seconds,reduced);float side=Math.Min(box.Width*sx,box.Height*sy);
            if(hc)using(var backing=new SolidBrush(Material.Canvas))g.FillRectangle(backing,box.X*sx,box.Y*sy,side,side);
            double opacity=reduced?1:Ease(0,.6,seconds);
            using(var attributes=new ImageAttributes()){
                var matrix=new ColorMatrix();matrix.Matrix33=(float)opacity;attributes.SetColorMatrix(matrix);
                g.DrawImage(logo,new Rectangle((int)(box.X*sx),(int)(box.Y*sy),(int)side,(int)side),0,0,logo.Width,logo.Height,GraphicsUnit.Pixel,attributes);
            }
            if(reduced||seconds>=1.44){
                using(var format=new StringFormat{LineAlignment=StringAlignment.Center})Material.DrawText(g,"Krono",name,hc?SystemColors.WindowText:Material.Text,new RectangleF(88*sx,16*sy,180*sx,44*sy),format);
                using(var pen=new Pen(hc?SystemColors.WindowText:Material.Border))g.DrawLine(pen,40*sx,68*sy,size.Width-40*sx,68*sy);
            }
        }
        public void Dispose(){logo.Dispose();name.Dispose();}
    }
}

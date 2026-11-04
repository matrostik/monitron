$source = @'
using System;
using System.Runtime.InteropServices;
public class MonitorVolumeProbe {
  public delegate bool Callback(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Physical { public IntPtr handle; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string description; }
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr rect, Callback callback, IntPtr data);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h, out uint n);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] Physical[] monitors);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h, byte code, out uint type, out uint current, out uint max);
  [DllImport("dxva2.dll", SetLastError=true)] public static extern bool DestroyPhysicalMonitors(uint n, Physical[] monitors);
  public static void Run() {
    if (!EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (h, dc, rect, data) => {
      uint count;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(h, out count)) {
        Console.WriteLine("Monitor enumeration failed: " + Marshal.GetLastWin32Error()); return true;
      }
      if (count == 0) return true;
      var monitors = new Physical[count];
      if (!GetPhysicalMonitorsFromHMONITOR(h, count, monitors)) {
        Console.WriteLine("Physical monitor discovery failed: " + Marshal.GetLastWin32Error()); return true;
      }
      try {
        foreach (var monitor in monitors) {
          uint type, current, max;
          bool ok = GetVCPFeatureAndVCPFeatureReply(monitor.handle, 0x62, out type, out current, out max);
          int error = ok ? 0 : Marshal.GetLastWin32Error();
          Console.WriteLine("Monitor: {0}; read: {1}; type: {2}; current: {3}; maximum: {4}; error: {5}", monitor.description, ok, type, current, max, error);
        }
      } finally { DestroyPhysicalMonitors(count, monitors); }
      return true;
    }, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
Add-Type -TypeDefinition $source -ErrorAction Stop
[MonitorVolumeProbe]::Run()

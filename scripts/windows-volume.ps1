param([ValidateSet('read','set','mute','unmute')][string]$Operation = 'read', [int]$Percent = 0)
$ErrorActionPreference = 'Stop'
if ($Operation -eq 'set' -and ($Percent -lt 0 -or $Percent -gt 100)) { throw 'Volume out of range' }
$displays = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | Where-Object Active)
if ($displays.Count -ne 1) { throw 'Expected exactly one active display; refusing ambiguous monitor selection.' }
$maker = -join ($displays[0].ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
if ($maker -ne 'GSM') { throw 'The active display is not identified as an LG monitor.' }
$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class MonitorVolume {
  delegate bool Callback(IntPtr h, IntPtr dc, IntPtr rect, IntPtr data);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Physical { public IntPtr handle; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string description; }
  [DllImport("user32.dll",SetLastError=true)] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr rect, Callback cb, IntPtr data);
  [DllImport("dxva2.dll",SetLastError=true)] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h,out uint n);
  [DllImport("dxva2.dll",SetLastError=true)] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h,uint n,[Out] Physical[] p);
  [DllImport("dxva2.dll",SetLastError=true)] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h,byte code,out uint kind,out uint current,out uint max);
  [DllImport("dxva2.dll",SetLastError=true)] static extern bool SetVCPFeature(IntPtr h,byte code,uint value);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n,Physical[] p);

  static string DescribeError(int err) {
    uint uErr = unchecked((uint)err);
    switch (uErr) {
      case 0xC026258B: return "DDC/CI checksum mismatch (0xC026258B - corrupted packet over display cable)";
      case 0xC0262584: return "DDC/CI VCP feature unsupported (0xC0262584)";
      case 0xC0262588: return "DDC/CI invalid command (0xC0262588)";
      case 0xC0262589: return "DDC/CI invalid message length (0xC0262589)";
      case 0xC0262582: return "DDC/CI I2C bus busy (0xC0262582)";
      default: return err.ToString() + " (0x" + uErr.ToString("X8") + ")";
    }
  }

  static bool ReadVCPWithRetry(IntPtr h, byte code, out uint type, out uint current, out uint max, int maxRetries = 3, int delayMs = 60) {
    type = current = max = 0;
    for (int i = 0; i < maxRetries; i++) {
      if (GetVCPFeatureAndVCPFeatureReply(h, code, out type, out current, out max)) return true;
      if (i < maxRetries - 1) System.Threading.Thread.Sleep(delayMs);
    }
    return false;
  }

  static bool SetVCPWithRetry(IntPtr h, byte code, uint value, int maxRetries = 3, int delayMs = 60) {
    for (int i = 0; i < maxRetries; i++) {
      if (SetVCPFeature(h, code, value)) return true;
      if (i < maxRetries - 1) System.Threading.Thread.Sleep(delayMs);
    }
    return false;
  }

  public static string Run(string operation, int percent) {
    var handles = new List<IntPtr>();
    if (!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,(h,dc,r,d)=>{handles.Add(h);return true;},IntPtr.Zero)) throw new Exception("Display enumeration failed");
    if (handles.Count != 1) throw new Exception("Expected exactly one logical display");
    uint count; if (!GetNumberOfPhysicalMonitorsFromHMONITOR(handles[0],out count) || count != 1) throw new Exception("Expected exactly one physical display");
    var p = new Physical[count]; if(!GetPhysicalMonitorsFromHMONITOR(handles[0],count,p)) throw new Exception("Physical monitor unavailable");
    try {
      uint type,current,max;
      if(!ReadVCPWithRetry(p[0].handle,0x62,out type,out current,out max)) throw new Exception("Volume read failed: " + DescribeError(Marshal.GetLastWin32Error()));
      if(type!=1 || max != 100 || current > max) throw new Exception("Unsupported or unverified volume range");
      bool set = operation == "set";
      if(set) {
        if(!SetVCPWithRetry(p[0].handle,0x62,(uint)percent)) throw new Exception("Volume write failed: " + DescribeError(Marshal.GetLastWin32Error()));
        System.Threading.Thread.Sleep(150);
        if(!ReadVCPWithRetry(p[0].handle,0x62,out type,out current,out max)) throw new Exception("Volume was sent but readback failed: " + DescribeError(Marshal.GetLastWin32Error()));
        if(type!=1 || max!=100 || current>max) throw new Exception("Volume was sent but readback is invalid");
      }
      uint muteType, muteValue, muteMax;
      bool muteAvailable = ReadVCPWithRetry(p[0].handle,0x8d,out muteType,out muteValue,out muteMax) && muteType==1 && (muteValue==1 || muteValue==2);
      if (operation=="mute" || operation=="unmute") {
        if(!muteAvailable) throw new Exception("Monitor mute is unavailable");
        uint requestedMute = operation=="mute" ? 1u : 2u;
        if(!SetVCPWithRetry(p[0].handle,0x8d,requestedMute)) throw new Exception("Mute write failed: " + DescribeError(Marshal.GetLastWin32Error()));
        System.Threading.Thread.Sleep(150);
        if(!ReadVCPWithRetry(p[0].handle,0x8d,out muteType,out muteValue,out muteMax) || muteValue!=requestedMute) throw new Exception("Mute was sent but could not be confirmed");
      }
      return "{\"current\":"+current+",\"maximum\":"+max+",\"requested\":"+(set?percent.ToString():"null")+",\"muted\":"+(muteAvailable?(muteValue==1?"true":"false"):"null")+"}";
    } finally {DestroyPhysicalMonitors(count,p);}
  }
}
'@
Add-Type -TypeDefinition $source
[MonitorVolume]::Run($Operation, $Percent)

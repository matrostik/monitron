$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$source = @'
using System;
using System.Runtime.InteropServices;

[Guid("657804FA-D6AD-4496-8573-CA4F877B9FCD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolumeCallback {
    [PreserveSig]
    int OnNotify(IntPtr pNotifyData);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
    int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(ref Guid pguidEventContext);
    int VolumeStepDown(ref Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    int OpenPropertyStore(int stgmAccess, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string strId);
    int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    int GetDevice(string pwstrId, out IMMDevice endpoint);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

[StructLayout(LayoutKind.Sequential)]
public struct AUDIO_VOLUME_NOTIFICATION_DATA {
    public Guid guidEventContext;
    public bool bMuted;
    public float fMasterVolume;
    public uint nChannels;
}

public class VolumeCallback : IAudioEndpointVolumeCallback {
    public static Guid AppContextGuid = Guid.NewGuid();
    public int OnNotify(IntPtr pNotifyData) {
        var data = (AUDIO_VOLUME_NOTIFICATION_DATA)Marshal.PtrToStructure(pNotifyData, typeof(AUDIO_VOLUME_NOTIFICATION_DATA));
        if (data.guidEventContext == AppContextGuid) return 0;
        int vol = (int)Math.Round(data.fMasterVolume * 100);
        string mute = data.bMuted ? "true" : "false";
        Console.WriteLine("{\"type\":\"change\",\"volume\":" + vol + ",\"muted\":" + mute + "}");
        return 0;
    }
}

public static class OsAudioService {
    private static IAudioEndpointVolume epv;
    private static VolumeCallback cb;

    public static void Init() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev;
        int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        if (hr != 0 || dev == null) throw new Exception("Failed to get default audio endpoint: " + hr);
        var IID_IAudioEndpointVolume = typeof(IAudioEndpointVolume).GUID;
        object epvObj;
        dev.Activate(ref IID_IAudioEndpointVolume, 23, IntPtr.Zero, out epvObj);
        epv = (IAudioEndpointVolume)epvObj;

        float vol;
        epv.GetMasterVolumeLevelScalar(out vol);
        bool mute;
        epv.GetMute(out mute);
        int volPercent = (int)Math.Round(vol * 100);
        Console.WriteLine("{\"type\":\"init\",\"volume\":" + volPercent + ",\"muted\":" + (mute ? "true" : "false") + "}");

        cb = new VolumeCallback();
        epv.RegisterControlChangeNotify(cb);
    }

    public static void SetVolume(int percent) {
        if (epv == null) return;
        float val = Math.Max(0f, Math.Min(1f, percent / 100f));
        Guid ctx = VolumeCallback.AppContextGuid;
        epv.SetMasterVolumeLevelScalar(val, ref ctx);
    }

    public static void SetMute(bool mute) {
        if (epv == null) return;
        Guid ctx = VolumeCallback.AppContextGuid;
        epv.SetMute(mute, ref ctx);
    }

    public static void Stop() {
        if (epv != null && cb != null) {
            try { epv.UnregisterControlChangeNotify(cb); } catch {}
        }
    }
}
'@

Add-Type -TypeDefinition $source -ErrorAction Stop

try {
    [OsAudioService]::Init()
    while ($true) {
        $line = [Console]::ReadLine()
        if ($null -eq $line) { break }
        $trimmed = $line.Trim()
        if ($trimmed -eq 'QUIT') { break }
        if ($trimmed -match '^SET\s+(\d+)$') {
            [OsAudioService]::SetVolume([int]$matches[1])
        } elseif ($trimmed -match '^MUTE\s+(true|false)$') {
            [OsAudioService]::SetMute([bool]::Parse($matches[1]))
        }
    }
} finally {
    [OsAudioService]::Stop()
}

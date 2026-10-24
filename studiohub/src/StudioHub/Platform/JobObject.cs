using System.Diagnostics;
using System.Runtime.InteropServices;
using static StudioHub.Platform.Native;

namespace StudioHub.Platform;

/// <summary>Bağlanan süreçler StudioHub kapandığında (çökse bile) Windows tarafından sonlandırılır.</summary>
public sealed class JobObject
{
    private readonly IntPtr _job;

    public JobObject()
    {
        _job = CreateJobObjectW(IntPtr.Zero, null);
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            BasicLimitInformation = new JOBOBJECT_BASIC_LIMIT_INFORMATION { LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE },
        };
        SetInformationJobObject(_job, JobObjectExtendedLimitInformation, ref info, (uint)Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>());
    }

    public void Add(Process p)
    {
        if (_job != IntPtr.Zero) AssignProcessToJobObject(_job, p.Handle);
    }
}

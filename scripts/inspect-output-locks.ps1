param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$resolvedDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

if (-not (Test-Path -LiteralPath $resolvedDirectory -PathType Container)) {
  Write-Host "[handles] output directory does not exist; nothing to release"
  exit 0
}

$lockedResourceCandidates = @(
  Get-ChildItem -LiteralPath $resolvedDirectory -File -Force -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName }
)

if ($lockedResourceCandidates.Count -eq 0) {
  Write-Host "[handles] output directory has no files; nothing to release"
  exit 0
}

$restartManagerSource = @'
using System;
using System.Runtime.InteropServices;

public static class OutputLockRestartManager
{
    private const int ErrorMoreData = 234;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeFileTime
    {
        public uint Low;
        public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct UniqueProcess
    {
        public int ProcessId;
        public NativeFileTime StartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessInfo
    {
        public UniqueProcess Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string ApplicationName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string ServiceShortName;
        public uint ApplicationType;
        public uint ApplicationStatus;
        public uint TerminalSessionId;
        [MarshalAs(UnmanagedType.Bool)]
        public bool Restartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint sessionHandle, int sessionFlags, string sessionKey);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(
        uint sessionHandle,
        uint fileCount,
        string[] fileNames,
        uint applicationCount,
        UniqueProcess[] applications,
        uint serviceCount,
        string[] serviceNames);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmGetList(
        uint sessionHandle,
        out uint processInfoNeeded,
        ref uint processInfoCount,
        [In, Out] ProcessInfo[] affectedApplications,
        out uint rebootReasons);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint sessionHandle);

    private static ProcessInfo[] GetAffectedProcesses(uint sessionHandle)
    {
        for (int attempt = 0; attempt < 5; attempt++)
        {
            uint needed;
            uint count = 0;
            uint rebootReasons;
            int result = RmGetList(sessionHandle, out needed, ref count, null, out rebootReasons);

            if (result == 0 && needed == 0)
                return new ProcessInfo[0];

            if (result != ErrorMoreData && result != 0)
                throw new InvalidOperationException("RmGetList failed with Windows error " + result + ".");

            if (needed == 0)
                return new ProcessInfo[0];

            ProcessInfo[] processes = new ProcessInfo[checked((int)needed)];
            count = needed;
            result = RmGetList(sessionHandle, out needed, ref count, processes, out rebootReasons);
            if (result == 0)
            {
                if (count == processes.Length)
                    return processes;

                ProcessInfo[] actual = new ProcessInfo[checked((int)count)];
                Array.Copy(processes, actual, checked((int)count));
                return actual;
            }

            if (result != ErrorMoreData)
                throw new InvalidOperationException("RmGetList failed with Windows error " + result + ".");
        }

        throw new InvalidOperationException("The list of processes using output files kept changing.");
    }

    public static int Inspect(string[] fileNames)
    {
        uint sessionHandle;
        int result = RmStartSession(out sessionHandle, 0, Guid.NewGuid().ToString("N"));
        if (result != 0)
            throw new InvalidOperationException("RmStartSession failed with Windows error " + result + ".");

        try
        {
            result = RmRegisterResources(
                sessionHandle,
                (uint)fileNames.Length,
                fileNames,
                0,
                null,
                0,
                null);
            if (result != 0)
                throw new InvalidOperationException("RmRegisterResources failed with Windows error " + result + ".");

            ProcessInfo[] affected = GetAffectedProcesses(sessionHandle);
            if (affected.Length == 0)
            {
                Console.WriteLine("[handles] no processes are using files under the output directory");
                return 0;
            }

            foreach (ProcessInfo process in affected)
                Console.WriteLine("[handles] in-use by PID " + process.Process.ProcessId + ": " + process.ApplicationName);

            Console.WriteLine("[handles] inspection only; no processes were closed or terminated");
            return 2;
        }
        finally
        {
            RmEndSession(sessionHandle);
        }
    }
}
'@

Add-Type -TypeDefinition $restartManagerSource -Language CSharp
$exitCode = [OutputLockRestartManager]::Inspect([string[]]$lockedResourceCandidates)
exit $exitCode

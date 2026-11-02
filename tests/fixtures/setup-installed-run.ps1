# Opt-in: Sandbox somente; fluxo 1.3.1/build 25 para 1.4.0/build 28.
$ErrorActionPreference='Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or $env:USERPROFILE -ne 'C:\Users\WDAGUtilityAccount') { throw 'SANDBOX_ONLY' }
Start-Transcript -Path C:\KronoEvidence\run.log -Force
try {
  $destination=Join-Path $env:LOCALAPPDATA 'Programs\Krono'
  $clean=& C:\KronoTest\driver.exe install;$cleanCode=$LASTEXITCODE;$clean|Set-Content C:\KronoEvidence\clean-install.txt
  if($cleanCode -ne 0 -or !(($clean -join "`n").Contains('before=Install;'))){throw 'CLEAN_INSTALL_FAILED'}
  $cleanRemove=& C:\KronoTest\driver.exe remove;$cleanRemoveCode=$LASTEXITCODE;$cleanRemove|Set-Content C:\KronoEvidence\clean-remove.txt
  if($cleanRemoveCode -ne 0 -or (Test-Path (Join-Path $destination 'Krono.exe'))){throw 'CLEAN_REMOVE_FAILED'}
  $old=Start-Process -FilePath C:\KronoTest\engine-25.exe -ArgumentList @('/S','/currentuser',"/D=$destination") -WorkingDirectory $env:TEMP -PassThru -WindowStyle Hidden
  if (!$old.WaitForExit(90000) -or $old.ExitCode -ne 0) {throw 'OLD_INSTALL_FAILED'}
  function InspectData([string]$mode) {
    $env:ELECTRON_RUN_AS_NODE='1'
    try {$result=(& (Join-Path $destination 'Krono.exe') C:\KronoTest\seed.cjs $mode | Out-String); if($LASTEXITCODE -ne 0){throw 'DATA_WORKER_FAILED'};return ($result|ConvertFrom-Json)} finally {Remove-Item Env:ELECTRON_RUN_AS_NODE}
  }
  $before=InspectData 'seed';$before|ConvertTo-Json -Depth 8|Set-Content C:\KronoEvidence\before.json
  function InvokeDriver([string]$action,[string]$label) {
    $lines=& C:\KronoTest\driver.exe $action;$code=$LASTEXITCODE;$lines|Set-Content "C:\KronoEvidence\$label.txt";if($code -ne 0){throw "$label returned $code"};return ($lines -join "`n")
  }
  $update=InvokeDriver 'install' 'update';if(!$update.Contains('before=Update;build=25') -or !$update.Contains('after=Reinstall;build=28')){throw 'UPDATE_CLASSIFICATION'}
  $after=InspectData 'read';if(($before|ConvertTo-Json -Compress -Depth 8) -ne ($after|ConvertTo-Json -Compress -Depth 8)){throw 'UPDATE_DATA_CHANGED'}
  $reinstall=InvokeDriver 'install' 'reinstall';if(!$reinstall.Contains('before=Reinstall;build=28')){throw 'REINSTALL_CLASSIFICATION'}
  $after=InspectData 'read';if(($before|ConvertTo-Json -Compress -Depth 8) -ne ($after|ConvertTo-Json -Compress -Depth 8)){throw 'REINSTALL_DATA_CHANGED'}
  $removed=InvokeDriver 'remove' 'remove';if(Test-Path (Join-Path $destination 'Krono.exe')){throw 'EXE_REMAINS'}
  if(Test-Path 'HKCU:\Software\Classes\AppUserModelId\com.krono.desktop'){throw 'AUMID_REMAINS'}
  if(!(Test-Path (Join-Path $env:APPDATA 'Krono\data\krono.sqlite'))){throw 'PROFILE_REMOVED'}
  $returned=InvokeDriver 'install' 'return';$after=InspectData 'read';if(($before|ConvertTo-Json -Compress -Depth 8) -ne ($after|ConvertTo-Json -Compress -Depth 8)){throw 'RETURN_DATA_CHANGED'}
  $downgrade=& C:\KronoTest\driver25.exe install;$downgradeCode=$LASTEXITCODE;$downgrade|Set-Content C:\KronoEvidence\downgrade.txt
  if($downgradeCode -ne 1638){throw "DOWNGRADE_NOT_BLOCKED: $downgradeCode"}
  $tampered=New-Object System.Diagnostics.Process
  $tampered.StartInfo.FileName='C:\KronoTest\driver-bad.exe';$tampered.StartInfo.Arguments='install';$tampered.StartInfo.UseShellExecute=$false;$tampered.StartInfo.CreateNoWindow=$true
  $tampered.StartInfo.RedirectStandardOutput=$true;$tampered.StartInfo.RedirectStandardError=$true
  if(!$tampered.Start()){throw 'TAMPER_DRIVER_START_FAILED'}
  $badOutput=$tampered.StandardOutput.ReadToEnd();$badError=$tampered.StandardError.ReadToEnd();$tampered.WaitForExit();$badCode=$tampered.ExitCode
  $badOutput|Set-Content C:\KronoEvidence\tampered.txt;$badError|Set-Content C:\KronoEvidence\tampered-error.txt
  @{exitCode=$badCode;integrityRejected=$badError.Contains('integridade')}|ConvertTo-Json|Set-Content C:\KronoEvidence\tampered-result.json
  $tampered.Dispose()
  if($badCode -ne 1 -or !$badError.Contains('integridade')){throw 'TAMPER_NOT_BLOCKED'}
  $env:ELECTRON_RUN_AS_NODE='1'
  try {$holder=Start-Process -FilePath (Join-Path $destination 'Krono.exe') -ArgumentList @('C:\KronoTest\hold.cjs') -PassThru -WindowStyle Hidden} finally {Remove-Item Env:ELECTRON_RUN_AS_NODE}
  try {
    if($holder.HasExited){throw 'PROCESS_GUARD_FIXTURE_EXITED'}
    $active=& C:\KronoTest\driver.exe install;$activeCode=$LASTEXITCODE;$active|Set-Content C:\KronoEvidence\active.txt
    if($activeCode -ne 1618){throw "PROCESS_NOT_BLOCKED: $activeCode"}
  } finally {if(!$holder.HasExited){$holder.Kill();$holder.WaitForExit()}}
  $final=InspectData 'read';if(($before|ConvertTo-Json -Compress -Depth 8) -ne ($final|ConvertTo-Json -Compress -Depth 8)){throw 'GUARDS_CHANGED_DATA'}
  $after|ConvertTo-Json -Depth 8|Set-Content C:\KronoEvidence\after.json
  $sac=Get-ItemPropertyValue 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' 'VerifiedAndReputablePolicyState' -ErrorAction SilentlyContinue
  @{passed=$true;build=28;SAC=$sac;network='disabled';cases=@('clean install 28 and removal','25 to 28 update','same build reinstall','uninstall removes own AUMID','return preserves same SQLite habit id and profile','downgrade rejected 1638','tampered engine rejected','active process rejected 1618');limits=@('NativeHost and embedded engines; not physical click or animation capture','no startup/login, energy, screen reader or physical DPI')}|ConvertTo-Json -Depth 8|Set-Content C:\KronoEvidence\result.json
} catch {$_|Out-String|Set-Content C:\KronoEvidence\failure.txt;throw} finally {Stop-Transcript}

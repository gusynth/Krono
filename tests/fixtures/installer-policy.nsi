# Exercita somente classificação pura; não instala, não acessa registro ou perfil.
Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
OutFile "${KRONO_FIXTURE_EXE}"
!include "${KRONO_POLICY_HEADER}"
Var KronoFixtureFile
Var KronoFixtureCases

!macro Check INSTALLED CANDIDATE EXPECTED
  StrCpy $KronoPolicyInstalled "${INSTALLED}"
  StrCpy $KronoPolicyCandidate "${CANDIDATE}"
  Call KronoClassifyVersion
  ${If} $KronoPolicyDecision != "${EXPECTED}"
    FileWrite $KronoFixtureFile 'failed: ${INSTALLED} / ${CANDIDATE} => $KronoPolicyDecision (expected ${EXPECTED})$\r$\n'
    FileClose $KronoFixtureFile
    SetErrorLevel 1
    Quit
  ${EndIf}
  IntOp $KronoFixtureCases $KronoFixtureCases + 1
!macroend

!macro CheckBuild INSTALLED INSTALLEDBUILD CANDIDATE CANDIDATEBUILD EXPECTED
  StrCpy $KronoPolicyInstalled "${INSTALLED}"
  StrCpy $KronoInstalledBuild "${INSTALLEDBUILD}"
  StrCpy $KronoPolicyCandidate "${CANDIDATE}"
  StrCpy $KronoCandidateBuild "${CANDIDATEBUILD}"
  Call KronoClassifyBuild
  ${If} $KronoPolicyDecision != "${EXPECTED}"
    FileWrite $KronoFixtureFile 'failed build: ${INSTALLED}/${INSTALLEDBUILD} -> ${CANDIDATE}/${CANDIDATEBUILD}: $KronoPolicyDecision$\r$\n'
    FileClose $KronoFixtureFile
    SetErrorLevel 1
    Quit
  ${EndIf}
  IntOp $KronoFixtureCases $KronoFixtureCases + 1
!macroend

Section
  FileOpen $KronoFixtureFile "${KRONO_FIXTURE_REPORT}" w
  IfErrors failed
  StrCpy $KronoFixtureCases 0
  !insertmacro Check "" "0.1.0" "install"
  !insertmacro Check "0.1.0" "0.1.0" "reinstall"
  !insertmacro Check "0.0.9" "0.1.0" "update"
  !insertmacro Check "0.2.0" "0.1.0" "downgrade"
  !insertmacro Check "0.1.1" "0.1.0" "downgrade"
  !insertmacro Check "1.0.0" "0.1.0" "downgrade"
  !insertmacro Check "0.10.0" "0.9.0" "downgrade"
  !insertmacro Check "0.9.0" "0.10.0" "update"
  !insertmacro Check "65535.65535.65535" "0.1.0" "downgrade"
  !insertmacro Check "65536.0.0" "0.1.0" "invalid"
  !insertmacro Check "0.01.0" "0.1.0" "invalid"
  !insertmacro Check "0.1" "0.1.0" "invalid"
  !insertmacro Check "0.1.0.0" "0.1.0" "invalid"
  !insertmacro Check "0..1" "0.1.0" "invalid"
  !insertmacro Check "0.1.0-beta" "0.1.0" "invalid"
  !insertmacro Check "invalid" "0.1.0" "invalid"
  !insertmacro Check " 0.1.0" "0.1.0" "invalid"
  !insertmacro Check "999999999999999999.0.0" "0.1.0" "invalid"
  !insertmacro Check "0.1.0" "invalid" "invalid"
  !insertmacro Check "" "" "invalid"
  !insertmacro CheckBuild "" "" "0.1.0" "1" "install"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "1" "reinstall"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "2" "update"
  !insertmacro CheckBuild "0.1.0" "2" "0.1.0" "1" "downgrade"
  !insertmacro CheckBuild "0.1.0" "" "0.1.0" "1" "legacy"
  !insertmacro CheckBuild "0.0.9" "" "0.1.0" "1" "update"
  !insertmacro CheckBuild "0.2.0" "" "0.1.0" "1" "downgrade"
  !insertmacro CheckBuild "0.1.0" "0" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.1.0" "01" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.1.0" "bad" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "0" "invalid"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "65536" "invalid"
  !insertmacro CheckBuild "0.1.0" "65535" "0.1.0" "65534" "downgrade"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "9999999999999999999999" "invalid"
  !insertmacro CheckBuild "" "1" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.0.9" "bad" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.2.0" "bad" "0.1.0" "1" "invalid"
  !insertmacro CheckBuild "0.1.0" "1" "0.1.0" "01" "invalid"
  !insertmacro CheckBuild "0.1.0" "11" "1.0.0" "12" "update"
  !insertmacro CheckBuild "1.0.0" "12" "1.0.0" "12" "reinstall"
  !insertmacro CheckBuild "1.0.0" "12" "0.1.0" "65535" "downgrade"
  !insertmacro CheckBuild "1.0.0" "12" "1.0.1" "1" "update"
  !insertmacro CheckBuild "1.0.0" "13" "1.0.0" "12" "downgrade"
  !insertmacro CheckBuild "1.0.0" "" "1.0.0" "12" "legacy"
  FileWrite $KronoFixtureFile 'passed: $KronoFixtureCases cases$\r$\n'
  FileClose $KronoFixtureFile
  SetErrorLevel 0
  Quit
  failed:
    SetErrorLevel 2
    Quit
SectionEnd

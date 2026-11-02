Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
!include "${PROJECT_DIR}\.test-data\generated\build-number.nsh"
!include "${PROJECT_DIR}\build\setup-consent.nsh"
OutFile "${KRONO_CONSENT_EXE}"
Section
  Call KronoReceiveConsent
  ${If} $KronoPipeApproved != 1
    SetErrorLevel 13
  ${EndIf}
SectionEnd

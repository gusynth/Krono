Unicode true
!define MUI_BGCOLOR "0C0C0E"
!define MUI_TEXTCOLOR "F5F5F7"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${PROJECT_DIR}\build\installerHeader.bmp"
!include MUI2.nsh
!include "${PROJECT_DIR}\build\legacy-confirmation.nsh"
Name "Krono — prévia isolada"
OutFile "${KRONO_PREVIEW_EXE}"
RequestExecutionLevel user
XPStyle on
SetFont "Segoe UI" 9
BrandingText "Krono"
Page custom KronoLegacyPage KronoLegacyLeave
!define MUI_PAGE_CUSTOMFUNCTION_SHOW KronoEnsureLegacyConsent
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE PortugueseBR

Function .onInit
  StrCpy $KronoLegacyRequired 1
  !ifdef KRONO_TEST_MODE
    StrCpy $KronoLegacyAccepted ${KRONO_TEST_MODE}
    !if ${KRONO_TEST_MODE} == 2
      StrCpy $KronoLegacyRequired 0
    !endif
    Call KronoEnsureLegacyConsent
    SetErrorLevel 0
    Quit
  !endif
FunctionEnd

Section
  # Prévia apenas: nenhuma instalação, leitura/escrita de registro ou dados.
  Call KronoEnsureLegacyConsent
SectionEnd

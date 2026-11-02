Unicode true
SilentInstall silent
RequestExecutionLevel user
!include LogicLib.nsh
!define PRODUCT_NAME "Krono fixture"
LangString appCannotBeClosed 1033 "Arquivo de teste bloqueado"
!addplugindir "${KRONO_TEST_PLUGINS}"
!include "${PROJECT_DIR}\.test-data\generated\nsis\extractAppPackage.nsh"
OutFile "${KRONO_TEST_EXE}"
Section
  InitPluginsDir
  SetOutPath "${KRONO_TEST_DESTINATION}"
  !insertmacro extractUsing7za "${KRONO_TEST_ARCHIVE}"
SectionEnd

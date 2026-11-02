Unicode true
SilentInstall silent
SilentUnInstall silent
RequestExecutionLevel user
!include LogicLib.nsh
OutFile "${KRONO_GENERATOR}"
Section
  WriteUninstaller "${KRONO_REMOVER}"
SectionEnd
Section Uninstall
  StrCmp $INSTDIR "${KRONO_TARGET}" valid
    SetErrorLevel 87
    Quit
  valid:
  SetOutPath $TEMP
  !include "${KRONO_REMOVE_BLOCK}"
SectionEnd

!macro customUnInstall
  ; Clean up runtime-created Python venv that NSIS doesn't track
  RMDir /r "$INSTDIR\resources\python\venv"
!macroend

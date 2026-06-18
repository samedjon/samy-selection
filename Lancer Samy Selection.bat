@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Samy Production 237

echo ==========================================
echo   SAMY PRODUCTION 237 - Selection Photo
echo ==========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js introuvable. Telecharge-le sur https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js trouve

:: Quick port check via netstat (no PowerShell needed)
netstat -an | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Serveur deja actif sur http://localhost:3000
    start "" "http://localhost:3000"
    start "" "http://localhost:3000/admin"
    goto fin
)

:: Clean Next.js cache to avoid stale build errors
if exist ".next\" (
    echo [INFO] Nettoyage du cache Next.js...
    rmdir /s /q ".next" >nul 2>nul
    echo [OK] Cache nettoye
)

:: Install deps if needed
if not exist "node_modules\" (
    echo [INFO] Installation des dependances...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERREUR] Echec de l'installation.
        pause
        exit /b 1
    )
    echo [OK] Dependances installees
) else (
    echo [OK] Modules deja installes
)

echo.
echo ==========================================
echo  Demarrage du serveur sur localhost:3000
echo ==========================================
echo.
echo Les pages web vont s'ouvrir automatiquement.
echo Pour arreter : ferme cette fenetre ou fais Ctrl+C.
echo.

:: Start Next.js dev server in a new window
start "Samy Production 237" cmd /k "npm run dev"

:: Wait, then open browser
echo Attente du demarrage...
ping -n 10 127.0.0.1 >nul
start "" "http://localhost:3000"
start "" "http://localhost:3000/admin"

:fin
echo.
echo ==========================================
echo  C'est parti ! Les pages sont ouvertes.
echo  Si rien ne s'affiche, va sur :
echo    http://localhost:3000
echo ==========================================
echo.
pause

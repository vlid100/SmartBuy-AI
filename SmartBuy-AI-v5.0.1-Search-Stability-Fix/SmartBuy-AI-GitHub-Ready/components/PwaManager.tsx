"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaManager() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(registration => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    try { await installPrompt.userChoice; } catch {}
    setInstallPrompt(null);
  }

  if (!online) {
    return <div className="pwaStatus offline"><WifiOff size={16}/><span><b>Немає інтернету</b><small>Збережені дані доступні, live-ціни оновляться після підключення.</small></span></div>;
  }

  if (updateReady) {
    return <div className="pwaStatus update"><RefreshCw size={16}/><span><b>Є нова версія SmartBuy</b><small>Онови сторінку, щоб застосувати зміни.</small></span><button onClick={() => window.location.reload()}>Оновити</button></div>;
  }

  if (installPrompt && !dismissed) {
    return <div className="pwaInstall"><div><Download size={18}/><span><b>Встановити SmartBuy</b><small>Відкривай як звичайний застосунок на ПК або телефоні.</small></span></div><button className="pwaInstallPrimary" onClick={() => void installApp()}>Встановити</button><button className="pwaInstallClose" onClick={() => setDismissed(true)} aria-label="Закрити"><X size={16}/></button></div>;
  }

  return null;
}

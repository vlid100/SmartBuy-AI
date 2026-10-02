"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="routeState"><div className="routeStateLogo danger">!</div><h1>Щось пішло не так</h1><p>Твої збережені дані не видалені. Спробуй повторити дію або оновити сторінку.</p><div className="routeStateActions"><button onClick={reset}>Спробувати ще раз</button><button className="secondary" onClick={() => window.location.reload()}>Оновити сторінку</button></div></main>;
}

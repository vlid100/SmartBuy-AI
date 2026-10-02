import Link from "next/link";

export default function NotFound() {
  return <main className="routeState"><div className="routeStateLogo">?</div><h1>Сторінку не знайдено</h1><p>Повернись до SmartBuy і продовжуй пошук.</p><div className="routeStateActions"><Link href="/">На головну</Link></div></main>;
}

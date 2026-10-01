import Link from "next/link";

export default function OfflinePage() {
  return <main className="routeState"><div className="routeStateLogo">S</div><h1>SmartBuy зараз офлайн</h1><p>Без інтернету live-пошук і оновлення цін недоступні. Після відновлення з’єднання повернись на головну.</p><div className="routeStateActions"><Link href="/">Спробувати ще раз</Link></div></main>;
}

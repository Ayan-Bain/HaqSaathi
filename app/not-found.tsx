import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="page-shell"><h1>Scheme not found</h1><p>This scheme is not in our catalogue.</p><Link className="button" href="/">Return to all schemes</Link></main>;
}
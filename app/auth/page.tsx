import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Hero Section */}
      <section className="mx-auto flex max-w-7xl flex-col items-center px-6 py-24 text-center">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm text-emerald-400">
          Browser-Based Development
        </span>

        <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-slate-100 md:text-6xl">
          Build, Code & Collaborate
          <span className="block bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Directly in Your Browser
          </span>
        </h1>

        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-400">
          A cloud development platform where developers can code inside a real
          Linux terminal, collaborate in real-time, and build projects together
          without installing anything.
        </p>

        <div className="mt-10 flex gap-4 ">
          <Link href="/auth/signup">
          <button className=" rounded-xl hover:cursor-pointer bg-emerald-500 px-6 py-3 font-semibold text-slate-900 transition hover:bg-emerald-400">
            Get Started
          </button>
          </Link>
          

          <button className="rounded-xl border border-slate-700 px-6 py-3 text-slate-300 transition hover:border-blue-400 hover:text-blue-300">
            Learn More
          </button>
        </div>
      </section>

      {/* Terminal Feature */}
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 md:grid-cols-2">
        <div>
          <span className="rounded-full bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
            Feature 01
          </span>

          <h2 className="mt-4 text-4xl font-bold text-slate-100">
            Powerful Linux Terminal
          </h2>

          <p className="mt-5 text-lg leading-8 text-slate-400">
            Open a fully functional Linux terminal directly in your browser.
            Install packages, run commands, execute code, and manage projects
            just like on your local machine.
          </p>

          <ul className="mt-8 space-y-3 text-slate-300">
            <li>✅ Browser-based terminal</li>
            <li>✅ Multiple programming languages</li>
            <li>✅ No installation required</li>
            <li>✅ Instant development environment</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-blue-900/20">
          <Image
            src="/wiKPSANY.gif"
            alt="Terminal"
            width={900}
            height={600}
            className="rounded-2xl"
            unoptimized
          />
        </div>
      </section>

      {/* Collaboration Feature */}
      <section className="bg-slate-900/50 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 md:grid-cols-2">
          <div className="order-2 md:order-1 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-emerald-900/20">
            <Image
              src="/collab.gif"
              alt="Collaboration"
              width={900}
              height={600}
              className="rounded-2xl"
              unoptimized
            />
          </div>

          <div className="order-1 md:order-2">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-400">
              Feature 02
            </span>

            <h2 className="mt-4 text-4xl font-bold text-slate-100">
              Real-Time Collaborative Coding
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-400">
              Invite teammates and code together in real time, similar to Google
              Docs. Every cursor, edit, and terminal action is synchronized
              instantly for a seamless collaborative experience.
            </p>

            <ul className="mt-8 space-y-3 text-slate-300">
              <li>💚 Live cursor tracking</li>
              <li>💚 Instant code synchronization</li>
              <li>💚 Shared terminal sessions</li>
              <li>💚 Team project collaboration</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-10 text-center text-slate-500">
        © 2026 Your Platform. Build together. Ship faster.
      </footer>
    </main>
  );
}
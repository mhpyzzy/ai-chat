"use client";
export default function Error() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-6xl font-bold text-red-600 dark:text-red-500">500</h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">Internal Server Error</p>
      </main>
    </div>
  );
}

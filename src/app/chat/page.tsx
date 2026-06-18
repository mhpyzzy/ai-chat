 export default function Blog() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-8">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">
          My Blog
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Welcome to my blog!
        </p>
      </div>
    </div>
  );
}

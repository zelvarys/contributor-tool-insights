import { Button } from "@/components/ui/button"

function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">repo-insights</h1>
        <p className="text-muted-foreground text-sm">
          Find out if your contributors are actually using the tools you told them to.
        </p>
      </div>
      <Button>Connect GitHub</Button>
    </div>
  )
}

export default App

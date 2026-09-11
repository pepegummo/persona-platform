import { ApiStatus } from "@/components/api-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Persona Platform</h1>
        <p className="text-muted-foreground">
          สร้าง AI persona ในสไตล์ของคุณ แล้วแชร์ลิงก์ให้เพื่อนคุยได้ —
          create an AI persona that answers in your style and share it by link.
        </p>
      </header>
      <ApiStatus />
    </main>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { startAttempt } from "@/app/actions/attempt";
import { getSession } from "@/lib/session";
import { ExamRunner } from "./exam-runner";
import { Alert, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

function Problem({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="max-w-[440px] w-full">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="card p-7">
          <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
          <p className="text-[15px] text-ink-2 mt-2 mb-6">{message}</p>
          <Link href="/student" className="btn-primary w-full">
            Back to my tests
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "student") redirect("/admin");
  if (session.mustChangePassword) redirect("/first-login");

  try {
    const paper = await startAttempt(id);
    // Requiring a visible face before the clock starts is the default. It can
    // be turned off for a lab whose webcams the detector cannot cope with, and
    // for the end-to-end tests, whose synthetic camera has no face in it. This
    // is read on the server so a student cannot switch it off themselves, and
    // it does not affect the warnings raised during the test.
    return (
      <ExamRunner
        paper={paper}
        faceGate={process.env.PROCTOR_FACE_GATE !== "off"}
      />
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    if (code === "ALREADY_SUBMITTED") {
      return (
        <Problem
          title="No attempts left for this test"
          message="You have used every attempt this test allows. Your result is on your tests page."
        />
      );
    }
    if (code === "NOT_ELIGIBLE") {
      return (
        <Problem
          title="This test is not assigned to you"
          message="It has not been published to any group you belong to. Speak to your department if you think this is a mistake."
        />
      );
    }
    if (code === "NOT_OPEN") {
      return (
        <Problem
          title="This test is not open"
          message="It has either not been published yet or it has been closed."
        />
      );
    }
    if (code === "NOT_FOUND") {
      return (
        <Problem
          title="Test not found"
          message="The test may have been deleted."
        />
      );
    }

    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="max-w-[440px] w-full">
          <Alert tone="error">
            Something went wrong starting this test. Please tell your
            invigilator.
          </Alert>
        </div>
      </main>
    );
  }
}

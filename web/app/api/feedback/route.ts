import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { message, email, page, plan } = await req.json();
    if (!message?.trim()) {
      return Response.json({ error: "Message required" }, { status: 400 });
    }

    const { userId } = await auth();

    const from =
      email?.trim() ||
      (userId ? `user:${userId}` : "Anonymous");

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "mitchell.magid@gmail.com",
      subject: "[Footnote feedback]",
      text: [
        message.trim(),
        "",
        "---",
        `From: ${from}`,
        `Plan: ${plan ?? "unknown"}`,
        `Page: ${page ?? "(unknown)"}`,
      ].join("\n"),
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Feedback route error:", err);
    // Return 200 anyway — don't show errors to the user
    return Response.json({ ok: true });
  }
}

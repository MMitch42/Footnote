import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    // Notify you that someone joined
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "mitchell.magid@gmail.com",
      subject: `New Footnote waitlist signup: ${email}`,
      html: `<p><strong>${email}</strong> just joined the Footnote waitlist.</p>`,
    });

    console.log(`[waitlist] ${email}`);

    // NOTE: user confirmation email requires a verified sending domain in Resend.
    // Once you verify a domain at resend.com/domains, uncomment this block
    // and change the `from` address to one@yourdomain.com.
    //
    // await resend.emails.send({
    //   from: "hello@yourdomain.com",
    //   to: email,
    //   subject: "You're on the Footnote waitlist",
    //   html: `
    //     <p>Hi,</p>
    //     <p>You're on the list. We'll reach out when early access opens.</p>
    //     <p>Footnote</p>
    //   `,
    // });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}

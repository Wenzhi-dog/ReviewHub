import { NextResponse, type NextRequest } from "next/server";

const OWNER_COOKIE = "rh_owner";
const OWNER_HEADER = "x-rh-owner";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  let ownerId = request.cookies.get(OWNER_COOKIE)?.value;
  const isNew = !ownerId;
  if (!ownerId) {
    ownerId = crypto.randomUUID();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(OWNER_HEADER, ownerId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (isNew) {
    response.cookies.set({
      name: OWNER_COOKIE,
      value: ownerId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

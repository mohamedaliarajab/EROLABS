import AppKit
import CoreText

/* The packages as a page somebody can forward. A deal at this size is decided
   by a person who never visits the site, so the visitor needs something to
   attach to an email — and it has to survive being printed, which is why this
   one is on white while the site is not. The mark and the two brand colours
   carry it. */

let W: CGFloat = 595.28, H: CGFloat = 841.89, M: CGFloat = 46
let INK = NSColor(srgbRed: 0.047, green: 0.055, blue: 0.086, alpha: 1)
let GREY = NSColor(srgbRed: 0.36, green: 0.39, blue: 0.46, alpha: 1)
let VIOLET = NSColor(srgbRed: 0.651, green: 0.145, blue: 0.933, alpha: 1)
let BLUE = NSColor(srgbRed: 0.118, green: 0.565, blue: 1.0, alpha: 1)
let RULE = NSColor(srgbRed: 0.85, green: 0.86, blue: 0.89, alpha: 1)

let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let out = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "packages.pdf"

func reg(_ p: String) {
    CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: p) as CFURL, .process, nil)
}
reg("\(dir)/fonts/sora.ttf"); reg("\(dir)/fonts/plex.ttf")

func font(_ name: String, _ size: CGFloat, weight: CGFloat? = nil) -> NSFont {
    var f = NSFont(name: name, size: size) ?? NSFont.systemFont(ofSize: size)
    if let w = weight {                                  // Sora ships variable
        let v = [kCTFontVariationAttribute: [2003265652: w]] as CFDictionary
        let d = CTFontDescriptorCreateWithAttributes(v)
        f = CTFontCreateCopyWithAttributes(f, size, nil, d) as NSFont
    }
    return f
}
let sora = "Sora", mono = "IBMPlexMono"

var y: CGFloat = H - M

var dry = false
func text(_ s: String, _ f: NSFont, _ c: NSColor, x: CGFloat, y ty: CGFloat,
          track: CGFloat = 0, width: CGFloat = 0, leading: CGFloat = 0) -> CGFloat {
    let para = NSMutableParagraphStyle(); para.lineSpacing = leading
    var attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: c, .paragraphStyle: para]
    if track != 0 { attrs[.kern] = track }
    let a = NSAttributedString(string: s, attributes: attrs)
    if width == 0 {
        if !dry { a.draw(at: NSPoint(x: x, y: ty - f.ascender)) }
        return f.ascender - f.descender
    }
    let h = a.boundingRect(with: NSSize(width: width, height: 9999),
                           options: [.usesLineFragmentOrigin]).height
    if !dry { a.draw(with: NSRect(x: x, y: ty - h, width: width, height: h), options: [.usesLineFragmentOrigin]) }
    return h
}

func rule(_ ty: CGFloat, _ x0: CGFloat = M, _ x1: CGFloat = W - M, _ col: NSColor = RULE) {
    col.setStroke()
    let p = NSBezierPath(); p.lineWidth = 0.6
    p.move(to: NSPoint(x: x0, y: ty)); p.line(to: NSPoint(x: x1, y: ty)); p.stroke()
}

func mark(_ x: CGFloat, _ cy: CGFloat, _ s: CGFloat) {          // the aperture
    let u = s / 100
    INK.setStroke()
    let ring = NSBezierPath(ovalIn: NSRect(x: x + 10*u, y: cy - 40*u, width: 80*u, height: 80*u))
    ring.lineWidth = 13 * u; ring.stroke()
    let core = NSBezierPath(ovalIn: NSRect(x: x + 35*u, y: cy - 15*u, width: 30*u, height: 30*u))
    NSGradient(colors: [BLUE, VIOLET])!.draw(in: core, angle: 90)
}

let pdf = NSMutableData()
var box = NSRect(x: 0, y: 0, width: W, height: H)
let ctx = CGContext(consumer: CGDataConsumer(data: pdf as CFMutableData)!, mediaBox: &box, nil)!
ctx.beginPDFPage(nil)
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)

NSColor.white.setFill(); NSBezierPath(rect: box).fill()

// ── header ──
mark(M, y - 9, 22)
_ = text("Ẹ̀RỌ LABS", font(mono, 11), INK, x: M + 30, y: y - 1, track: 2.4)
_ = text("SOCIAL MEDIA MANAGEMENT", font(mono, 8), GREY, x: W - M - 150, y: y - 3, track: 1.6, width: 150)
y -= 26; rule(y); y -= 28

// ── the claim ──
y -= text("Your social media. Not your job.", font(sora, 23, weight: 600), INK, x: M, y: y)
y -= 10
y -= text("We manage your social media from strategy to results — so you can focus on running your business. Strategy, content, creative, publishing, community, leads, analytics and optimisation, as one system.",
          font(sora, 9.5), GREY, x: M, y: y, width: W - M*2, leading: 3)
y -= 24

// ── the three ──
let tiers: [(String, String, String, [String])] = [
 ("STARTER", "₦500,000", "Stay consistent.",
  ["8 feed posts · 8 reels · 20–30 stories","Monthly content calendar","Basic strategy, ideas and concepts",
   "AI-assisted copy, captions, hashtags","Brand and visual consistency","Scheduling and publishing",
   "Basic analytics and monthly summary","1 revision round"]),
 ("GROWTH", "₦1,000,000", "Turn social into a growth channel.",
  ["16 feed posts · 16 reels · 30–60 stories","Advanced strategy and content pillars","Audience and competitor analysis",
   "Campaign planning, AI concepts","Automated publishing","Instagram DM automation",
   "Lead capture, qualification, database","Automated follow-ups","Per-post performance analysis",
   "Monthly report · lead report · export","2 revision rounds · optimisation"]),
 ("PREMIUM", "₦1,400,000", "Build a serious growth engine.",
  ["Everything in Growth, plus:","24 feed posts · 24 reels · 60+ stories","Advanced strategy, competitor intelligence",
   "Campaigns, product-specific pushes","Creative variations and A/B testing","Advanced community management",
   "Lead scoring — hot / warm / cold","Lead pipeline, conversion tracking","Hook, CTA and timing analysis",
   "Monthly strategic report","Priority production and support"])]

let colW = (W - M*2 - 24) / 3

/* Measure first, then draw. The highlight behind Growth has to be the height
   of the column, and nothing knows that height until the bullets have been
   laid out — drawn blind it ran to the bottom of the page. */
func column(_ i: Int, _ t: (String, String, String, [String]), from ty0: CGFloat) -> CGFloat {
    let x = M + CGFloat(i) * (colW + 12)
    var ty = ty0
    ty -= text(t.0, font(mono, 8), i == 1 ? VIOLET : GREY, x: x, y: ty, track: 1.8)
    ty -= 6
    ty -= text(t.1, font(sora, 17, weight: 600), INK, x: x, y: ty)
    _ = text("per month", font(mono, 6.5), GREY, x: x, y: ty - 1, track: 0.8)
    ty -= 14
    ty -= text(t.2, font(sora, 8.6, weight: 500), INK, x: x, y: ty, width: colW, leading: 2)
    ty -= 9
    for b in t.3 {
        if !dry {
            VIOLET.withAlphaComponent(0.7).setFill()
            NSBezierPath(ovalIn: NSRect(x: x, y: ty - 5.5, width: 2.4, height: 2.4)).fill()
        }
        ty -= text(b, font(sora, 8), GREY, x: x + 8, y: ty, width: colW - 8, leading: 1.6) + 3.4
    }
    return ty
}

dry = true
var lowest = y
for (i, t) in tiers.enumerated() { lowest = min(lowest, column(i, t, from: y)) }
dry = false

// the highlight, now that its height is known
VIOLET.withAlphaComponent(0.05).setFill()
NSBezierPath(roundedRect: NSRect(x: M + colW + 5, y: lowest - 6, width: colW + 14,
                                 height: y - lowest + 28), xRadius: 4, yRadius: 4).fill()
_ = text("MOST POPULAR", font(mono, 6.5), VIOLET, x: M + colW + 12, y: y + 13, track: 1.3)

for (i, t) in tiers.enumerated() { _ = column(i, t, from: y) }

y = lowest - 18

// ── the thing people get wrong ──
VIOLET.withAlphaComponent(0.07).setFill()
let noteH: CGFloat = 30
NSBezierPath(roundedRect: NSRect(x: M, y: y - noteH, width: W - M*2, height: noteH), xRadius: 4, yRadius: 4).fill()
_ = text("Advertising spend is separate.", font(sora, 9, weight: 600), INK, x: M + 12, y: y - 10)
_ = text("The monthly fee covers the Ẹ̀rọ Labs service. Any Meta, Instagram or Facebook advertising budget is paid separately and is never taken out of the figures above.",
         font(sora, 8), GREY, x: M + 12, y: y - 20, width: W - M*2 - 24, leading: 1.5)
y -= noteH + 22

// ── the month ──
_ = text("THE FIRST THIRTY DAYS", font(mono, 8), BLUE, x: M, y: y, track: 1.8)
y -= 15
for d in [("Days 1–3","We take it off you — one call, account access, and we read what has been posted so far."),
          ("Days 4–7","You approve a month — pillars, calendar and first concepts. One approval, not thirty."),
          ("Days 8–10","The first posts go out — written, designed, scheduled. You see the queue first."),
          ("Days 11–25","It runs without you — posting on schedule, messages answered, buyers captured."),
          ("Day 30","The month in numbers — and next month planned from this month's figures.")] {
    _ = text(d.0, font(mono, 7.5), VIOLET, x: M, y: y, track: 1)
    y -= text(d.1, font(sora, 8.4), GREY, x: M + 62, y: y, width: W - M*2 - 62, leading: 1.5) + 5
}

// ── foot ──
y = M + 14; rule(y + 12)
_ = text("instagram.com/ero.labs", font(mono, 7.5), GREY, x: M, y: y, track: 1)
_ = text("Lagos · Prices in Nigerian Naira, per month", font(mono, 7.5), GREY, x: W - M - 220, y: y, track: 1, width: 220)

ctx.endPDFPage(); ctx.closePDF()
pdf.write(toFile: out, atomically: true)
print("wrote \(out)  \(pdf.length / 1024)KB")

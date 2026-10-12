# Reference breakdown และ reference-recreation prompt

คลิปอ้างอิง: `v24044gl0000d5rq2s7og65oths1ia90.MP4` (576×1024, ยาว 25.1 วินาที) เป็นคลิป TikTok ของ heroinspo.com ที่อัดหน้าจอเว็บ “CryptoHub” ขณะถูกเลื่อน

**วิธีดู** เครื่องนี้ไม่มี ffmpeg จึงเปิดไฟล์ใน Chrome ผ่าน Playwright แล้ว seek ทีละ 0.5 วินาที (50 เฟรม) และทุก 0.2 วินาทีในช่วงเปลี่ยนฉาก 6 ช่วง (114 เฟรม) ดูเฉพาะเว็บแนวนอนกลางคลิป ไม่นับข้อความครอบคลิป พื้นหลังเบลอ ลายน้ำ และ outro
ไม่พบไฟล์ `reference_keyframes.png` และ `detail_panels.jpg` ในเครื่อง จึงใช้เฟรมที่แตกเองทั้งหมด

เวลาในตารางเป็นตำแหน่งใน recording (±0.2 วินาที) ไม่ใช่ความยาวของเว็บ ช่วงเว็บจริงอยู่ที่ประมาณ 00:00–00:21 หลังจากนั้นเป็น outro

## แยกทีละฉาก

| ฉาก | สิ่งที่เห็นจริง | วิธีที่เลือกสร้าง | สิ่งที่ยังยืนยันไม่ได้ |
| --- | --- | --- | --- |
| **A** 00:00–00:03 Hero | หัวข้อกลางหน้า 3 บรรทัด ค่อย ๆ ชัดขึ้นทีละบรรทัด (เบลอ→คม, เทา→ดำ) ของรอบหัวข้อเปลี่ยน 3 สถานะ: จุดกับเส้นกราฟเล็ก → ไอคอนโครงเส้นกระจายออก → ไอคอนสีเต็ม | ชิ้นงานรอบหัวข้อมีตำแหน่ง “กระจาย” กับตำแหน่ง “เข้าที่” แล้วผูกกับระยะเลื่อน ไม่ใช่ลอยขึ้นลงวนเอง | ต้นฉบับเล่นตามเวลาตอนโหลด หรือตามการเลื่อน ดูจากคลิปแยกไม่ออก |
| **B** 00:03–00:05 Handoff | ไอคอนจาก Hero บินเข้าไปอยู่ในโทรศัพท์ที่โผล่จากขอบล่าง โทรศัพท์ขึ้นมาอยู่กลางจอ พื้นหลังเปลี่ยนจากครีมเป็นเขียวมะนาวพร้อมกัน แล้วโทรศัพท์ค้างอยู่ขณะข้อความข้าง ๆ เปลี่ยน | เวทีเดียวที่ sticky ค้างจอ วัตถุชิ้นเดิมมี pose หลายช่วงตาม progress ของการเลื่อน สีพื้นคำนวณจาก progress ตัวเดียวกัน จึงเปลี่ยนพร้อมตำแหน่งเสมอ | ไลบรารี (GSAP ScrollTrigger / Lenis ฯลฯ) และ easing จริง |
| **C** 00:05–00:09 Bento | พื้นเทาเข้ม การ์ดขาวเข้ามาเป็นกล่องเปล่าก่อน แล้วเนื้อหาข้างในค่อยเติมตามลำดับ บางการ์ดมี loop เล็ก ๆ ของตัวเอง | การ์ดแต่ละใบมี progress ของตัวเองตามตำแหน่งบนจอ ช่วงแรกขยับ/ชัดเฉพาะกรอบ ช่วงหลังเนื้อหาจึงขึ้น | จังหวะหน่วงของแต่ละการ์ดเป็นค่าคงที่หรือสุ่ม |
| **D** 00:09–00:11.5 Burst | กองรูปโปรไฟล์กลางจอแตกกระจายออกไปยังตำแหน่งที่วางไว้ เปิดที่ตรงกลางให้หัวข้อ หัวข้อขึ้นทีละคำ | ตำแหน่งปลายทางกำหนดไว้ล่วงหน้าเป็นสัดส่วนของเวที ไม่สุ่ม | ไม่ได้นำมาใช้ (ดู motion-mapping) |
| **E** 00:11.5–00:13 Hero product | โทรศัพท์กลางจอ ป้ายข้อมูลเล็ก ๆ พุ่งออกซ้ายขวาจากหลังเครื่อง | ภาพหลักอยู่กลาง ป้ายเป็นข้อความนอกภาพ ขึ้นทีละป้าย | ป้ายออกพร้อมกันหรือไล่ตามการเลื่อน |
| **F** 00:13–00:18.7 Collapse / unfold | สไลด์ฟีเจอร์: ภาพสูงมุมมนอยู่ฝั่งหนึ่ง ข้อความอีกฝั่ง ตอนเปลี่ยน ภาพเก่า “หุบ” พื้นที่มองเห็นจนเหลือแถบแคบ ขณะภาพใหม่โผล่เป็นแถบแคบอีกจุดแล้ว “คลี่” ออก สองจังหวะทับเวลากัน ภาพกับข้อความสลับฝั่ง ภาพข้างในไม่ถูกบีบ | `clip-path: inset(... round)` บนกรอบขนาดคงที่ เปลี่ยนเฉพาะส่วนที่มองเห็น ภาพข้างในเลื่อนสวนเล็กน้อย ช่วงหุบกับช่วงคลี่เหลื่อมกัน 40% | ต้นฉบับใช้ clip-path, mask หรือเปลี่ยนความกว้างกล่องจริง |
| **G** 00:18.7–00:21 Closing | พื้นเข้ม การ์ดขึ้นมาด้านหน้า เส้นหนาสีเขียวมะนาววาดตัวเองเป็นโค้งอยู่ด้านหลัง | เส้น SVG เส้นเดียว ผูก `pathLength` กับระยะเลื่อนช่วงท้ายหน้า วาดจบแล้วหยุด | เส้นวาดตามเวลาหรือตามการเลื่อน |

ลักษณะร่วมทั้งคลิป: ทุกฉากย้อนได้เมื่อเลื่อนกลับ มีจังหวะพักให้อ่านหลังของเข้าที่ สีเน้นมีสีเดียว หนึ่งฉากมีจุดนำสายตาจุดเดียว

## Signature motions ที่พิสูจน์แล้ว

ดูได้ที่หน้า `/motion-study` (เปิดได้เฉพาะตอน `npm run dev` ไม่อยู่ใน production build) ใช้กล่อง proxy ที่เขียนคำว่า PROXY กำกับ ไม่มีภาพผลิตภัณฑ์จริงและไม่ได้นำ proxy ไปใช้บน Landing

1. **ส่งต่อวัตถุระหว่างฉาก** (B): ชิ้นที่กระจายรอบหัวข้อเคลื่อนเข้าไปอยู่ในกรอบที่ขึ้นมาจากขอบล่าง
2. **หุบเป็นแถบแล้วคลี่ภาพใหม่** (F): ภาพเก่าหุบ ภาพใหม่คลี่ ข้อความสลับฝั่ง ไม่มีการบีบภาพ
3. **เปลี่ยนพื้นหลังพร้อมจัดวางใหม่** (B, C): สีพื้นทั้งเวทีเปลี่ยนในช่วงเดียวกับที่วัตถุย้ายตำแหน่ง
4. แถม: การ์ดเข้าเป็นกล่องเปล่าก่อนเนื้อหา (C) และเส้นวาดตัวเอง (G)

## Reference-recreation prompt

ใช้สั่งสร้าง “ท่าทาง” ของต้นฉบับใหม่ โดยไม่ลอกเนื้อหา สี หรือแบรนด์

```text
Build a single-page, scroll-driven marketing site. The page scrolls natively: never call
preventDefault on wheel or touch, no scroll snapping, no custom scrollbar. All motion below is a
pure function of scroll progress, so scrolling back plays it in reverse and nothing accumulates.

Structure: tall sections, each containing one stage that is `position: sticky; top: 0; height: 100svh`.
Section progress p runs 0→1 from "section top at viewport top" to "section bottom at viewport
bottom". Smooth p with a short, stiff spring so wheel steps glide, but never let it lag visibly.
Every moving element has a list of keyframes [p, {x, y, scale, opacity, rotate}] in stage pixels,
computed from the stage size and eased in-out between neighbours. Use transforms and opacity only.

Scene A (hero). Centre headline, visible and usable at p=0 with no intro to wait for. Around it,
6 small objects in designed (not random) positions with slight rotation. A large framed object
shows only its top third at the bottom edge.

Scene B (handoff). As p grows the headline lifts and fades. The framed object rises to the centre
and the 6 objects travel to exact slots inside it, arriving as it stops. The page background
interpolates to a second colour over the same range. Hold: nothing moves for a short stretch.

Scene C (bento). Background goes dark. Cards enter as empty rounded shells (opacity, y, slight
scale); only after a shell has settled does its inner content fade and rise in. Stagger by card.

Scene F (feature slides). One pinned stage, N slides. Each slide = one tall rounded image panel
on one side and a text block on the other, sides alternating. Transition i→i+1: the outgoing
panel's VISIBLE AREA shrinks to a narrow rounded strip (animate `clip-path: inset()` with a
`round` radius; never scale or squeeze the image) while the incoming panel's visible area grows
from a narrow strip. The two overlap in time by roughly 40%. The image inside drifts a few pixels
against the wipe. Text of the outgoing slide fades out before the fold, text of the incoming one
rises in line by line after its panel is mostly open.

Scene G (closing). Dark background, centred closing headline and one button. Behind them one very
thick stroke draws itself along a wide curve (SVG path, pathLength tied to scroll through the last
screen), passing under and around the button, never across it. It finishes and stays.

Rules: one accent colour. One focal point per scene. After each arrival leave a rest beat long
enough to read. With prefers-reduced-motion render the same content as a static, stacked page.
Clean up observers and listeners on unmount; recompute layout on resize and orientation change.
```

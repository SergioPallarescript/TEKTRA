import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ICON_PATH =
  "M413.91,150.52l-43.86-.13.21-80.88-44.65-23.83c-1.48-.79-2.89-1.5-4.39-1.97v-.33s-2.77-.21-2.77-.21c0,0,0,0,0,0l-3.22-.24v.74c-.73.29-1.39.65-2,.99-.24.14-.5.28-.77.43l-45.49,24.32-.3,48.27-37.74-19.87c-.34-.18-.71-.41-1.09-.64-.93-.57-2.02-1.23-3.23-1.65v-1.51s-3.99,1.42-3.99,1.42c0,0,0,0,0,0l-2,.71v.05c-9.33,3.57-18.25,8.64-26.88,13.56-6.47,3.7-13.17,7.52-20.06,10.72l-1.74.81.07,104.75.33,27.81,51.29-.09,47.16.18v.04s3.21,0,3.21,0l2.8.04v-.04s91.05-.28,91.05-.28l16.02-.06,31.82.29.15.02c.4.06.89.13,1.41.13.75,0,1.56-.15,2.31-.71.7-.52,1.16-1.29,1.28-2.15l.03-.21.06-95.47c0-2.99-2.59-5-5.01-5.01ZM322.79,50.98l41.47,22.13-.2,78.09c-.27-.02-.55-.03-.82-.05-1.99-.14-3.99-.27-5.99-.36-.05,0-.1,0-.14,0-2.1-.1-4.21-.17-6.32-.23-.55-.02-1.1-.03-1.65-.04-1.73-.04-3.45-.07-5.18-.09-.39,0-.78-.01-1.17-.02-2.12-.02-4.23-.03-6.33-.03-.07,0-.14,0-.21,0-.24,0-.48,0-.72,0-2.73,0-5.45.01-8.15.03-1.87,0-3.73.02-5.59.02-.16,0-.31,0-.47,0l-.06-100.25c.49.24,1,.51,1.56.8ZM272.94,73.02l42.29-22.6.03,56.3.03,43.72h-20.26s-22.18,0-22.18,0l-.22-27.7v-.09s.31-49.62.31-49.62ZM224.62,102.24s.05.03.08.05c.5.3.98.6,1.43.83l40.52,21.33.21,25.98-10.97.02-31.11.05-.06-19.2-.09-29.06ZM175.99,226.01l-.07-100.9c6.49-3.12,12.72-6.68,18.77-10.13,8.11-4.63,15.84-9.04,23.93-12.35l.06,19.97.1,30.91-.08,32.04-.15,62.23-42.29.07-.26-21.84ZM224.7,185.28l.07-28.77,34.14-.06,10.96-.02h25.72s25.7,0,25.7,0h0c2.03,0,4.06-.02,6.09-.03,12-.06,24.38-.11,36.38.79l-.33,42.01-96.5.11-.07,48.63-42.32-.16.15-62.5ZM412.87,247.91l-30.99-.29-16.06.06-92.28.28s-.05-.03-.07-.04c-.17-.11-.35-.22-.56-.32-.01,0-.03-.02-.04-.02l.06-42.29,96.46-.11.38-48.5c.07-.1.13-.2.19-.3l42.97.12-.05,91.39Z";

const K_LINE_POINTS = "228.7 189.23 280.12 240.42 300.11 240.42 239.17 179.7 228.7 189.23";

const LETTERS_PATH =
  "M502.5,120.44h-9.75l-48.5,107.88-27.91-45.36c8.89-1.83,16.1-5.46,21.71-10.87,5.57-5.42,8.33-12.07,8.33-19.92,0-6.2-1.83-11.66-5.49-16.44-3.66-4.75-8.59-8.48-14.8-11.21-6.24-2.73-13.08-4.07-20.55-4.07h-120.86l-68.68,62.44v-62.44H32.49v7.21h43.2v112.77h14.39v-112.77h109.26v49.17h-64.76v7.21h64.76v49.17h-74.36v7.21h91.02v-48.05l71.22-64.72h42v112.77h14.39v-112.77h61.93c7.14,0,13.12,2.2,18.01,6.65,4.86,4.45,7.29,10.39,7.29,17.86s-2.43,13.56-7.29,18.01c-4.9,4.45-10.87,6.65-18.01,6.65h-10.05l39.91,63.6h10.61l2.39-5.34,44.35-98.76,48.35,104.1h15.25l-53.85-119.98Z";

// Convert polygon points to a closed path for stroke animation
const polygonToPath = (points: string) => {
  const coords = points.trim().split(/\s+/).map(Number);
  let d = `M${coords[0]},${coords[1]}`;
  for (let i = 2; i < coords.length; i += 2) {
    d += ` L${coords[i]},${coords[i + 1]}`;
  }
  return d + " Z";
};

const K_LINE_PATH = polygonToPath(K_LINE_POINTS);

const DRAW_DURATION = 1.8;
const UNDRAW_DURATION = 0.8;
const TEXT_DURATION = 1.4;
const PAUSE = 0.3;
const FILL_DELAY = 0.6;

const TektraSplash = ({ onFinish }: { onFinish: () => void }) => {
  const [stage, setStage] = useState<"drawIcon" | "undrawIcon" | "drawText" | "done">("drawIcon");

  return (
    <AnimatePresence>
      {stage !== "done" && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-[50vw] max-w-[400px]">
            <svg viewBox="0 0 598.15 306.46" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
              {/* Icon – solid fill fades in while stroke draws */}
              {(stage === "drawIcon" || stage === "undrawIcon") && (
                <motion.path
                  d={ICON_PATH}
                  fill="#1d1d1b"
                  stroke="#1d1d1b"
                  strokeWidth={1.5}
                  initial={
                    stage === "drawIcon"
                      ? { pathLength: 0, fillOpacity: 0 }
                      : { pathLength: 1, fillOpacity: 1 }
                  }
                  animate={
                    stage === "drawIcon"
                      ? { pathLength: 1, fillOpacity: 1 }
                      : { pathLength: 0, fillOpacity: 0 }
                  }
                  transition={
                    stage === "drawIcon"
                      ? {
                          pathLength: { duration: DRAW_DURATION, ease: "easeInOut" },
                          fillOpacity: { duration: 0.5, delay: DRAW_DURATION * 0.5 },
                        }
                      : {
                          pathLength: { duration: UNDRAW_DURATION, ease: "easeInOut" },
                          fillOpacity: { duration: UNDRAW_DURATION * 0.4, ease: "easeOut" },
                        }
                  }
                  onAnimationComplete={() => {
                    if (stage === "drawIcon") {
                      setTimeout(() => setStage("undrawIcon"), PAUSE * 1000);
                    } else {
                      setStage("drawText");
                    }
                  }}
                />
              )}

              {/* Text – two elements animate in parallel */}
              {stage === "drawText" && (
                <>
                  {/* K diagonal line */}
                  <motion.path
                    d={K_LINE_PATH}
                    fill="#1d1d1b"
                    stroke="#1d1d1b"
                    strokeWidth={1}
                    initial={{ pathLength: 0, fillOpacity: 0 }}
                    animate={{ pathLength: 1, fillOpacity: 1 }}
                    transition={{
                      pathLength: { duration: TEXT_DURATION, ease: "easeInOut" },
                      fillOpacity: { duration: 0.5, delay: TEXT_DURATION * FILL_DELAY },
                    }}
                  />
                  {/* Rest of TEKTRA letters */}
                  <motion.path
                    d={LETTERS_PATH}
                    fill="#1d1d1b"
                    stroke="#1d1d1b"
                    strokeWidth={1}
                    initial={{ pathLength: 0, fillOpacity: 0 }}
                    animate={{ pathLength: 1, fillOpacity: 1 }}
                    transition={{
                      pathLength: { duration: TEXT_DURATION, ease: "easeInOut" },
                      fillOpacity: { duration: 0.5, delay: TEXT_DURATION * FILL_DELAY },
                    }}
                    onAnimationComplete={() => {
                      setTimeout(() => {
                        setStage("done");
                        onFinish();
                      }, 400);
                    }}
                  />
                </>
              )}
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TektraSplash;

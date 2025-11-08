"use client";

import { motion, useMotionValue, useAnimationControls } from "framer-motion";
import React, { useRef, useEffect, useState } from "react";
import NumberFlow, { continuous } from "@number-flow/react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const BALL_SIZE = 48; // size-12 = 48px
const PADDLE_WIDTH = 180;
const PADDLE_HEIGHT = 20;
const PADDLE_Y_OFFSET = 80; // Distance from bottom
const BOUNCE_COEFFICIENT = 0.9; // Energy retained after bounce (0-1)
const PADDLE_BOUNCE_COEFFICIENT = 1.1; // Extra bounce from paddle
const FRICTION = 0.999; // Reduced friction for continuous play
const GRAVITY = 0.3; // Gravity strength
const MIN_VELOCITY = 2; // Minimum velocity to keep ball moving
const INITIAL_VELOCITY = 8; // Initial ball velocity

const Skiper64 = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLLIElement>(null);
  const paddleRef = useRef<HTMLDivElement>(null);
  const topPaddleRef = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const vx = useMotionValue(INITIAL_VELOCITY);
  const vy = useMotionValue(INITIAL_VELOCITY);
  const paddleX = useMotionValue(0);
  
  const controls = useAnimationControls();
  const paddleControls = useAnimationControls();
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTime = useRef(performance.now());
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [points, setPoints] = useState(0);
  const [displayedScore, setDisplayedScore] = useState(0); // Score to display in game over popup
  const gameOverRef = useRef(false);
  const gamePausedRef = useRef(false);
  const lastTopPaddleHit = useRef(false); // Track if ball just hit top paddle to prevent multiple point counts
  const audioContextRef = useRef<AudioContext | null>(null);

  // Pointer lock state
  const [pointerLocked, setPointerLocked] = useState(false);

  // Theme state
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize audio context
  useEffect(() => {
    // Create audio context on first user interaction
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    };
    
    // Initialize on any user interaction
    const handleUserInteraction = () => {
      initAudio();
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  // Function to play sound when ball hits top paddle
  const playTopPaddleSound = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioContext = audioContextRef.current;
    
    // Resume audio context if suspended (required by some browsers)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Create oscillator for a pleasant "ping" sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Set frequency for a pleasant tone (around 800Hz)
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.type = 'sine';
    
    // Create a quick attack and decay envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  };

  // Handle pointer lock change
  useEffect(() => {
    const handlePointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === containerRef.current);
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  // Request/release pointer lock based on game state
  useEffect(() => {
    if (gameStarted && !gameOver && !gamePaused && containerRef.current) {
      containerRef.current.requestPointerLock();
    } else if (document.pointerLockElement === containerRef.current) {
      document.exitPointerLock();
    }
  }, [gameStarted, gameOver, gamePaused]);

  // Mouse tracking for paddle
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      // Don't move paddle when game hasn't started
      if (!gameStarted) return;
      
      // Don't move paddle when game is paused
      if (gamePaused) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();

      let mouseX;
      if (pointerLocked) {
        // When pointer is locked, use movement deltas
        // Accumulate movement to track position relative to container center
        const currentPaddleX = paddleX.get();
        const movementX = e.movementX;
        mouseX = currentPaddleX + movementX;
      } else {
        // Fallback to client coordinates
        mouseX = e.clientX - containerRect.left - containerRect.width / 2;
      }

      const maxX = containerRect.width / 2 - PADDLE_WIDTH / 2;
      const constrainedX = Math.max(-maxX, Math.min(maxX, mouseX));

      paddleX.set(constrainedX);
      paddleControls.set({ x: constrainedX });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [paddleX, paddleControls, pointerLocked, gamePaused, gameStarted]);

  // Update ref when gameOver changes
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  // Reset displayed score when game over to trigger animation
  useEffect(() => {
    if (gameOver) {
      setDisplayedScore(0);
      // Use a small timeout to ensure the reset happens before the update
      const timeoutId = setTimeout(() => {
        setDisplayedScore(points);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [gameOver, points]);

  // Update ref when gamePaused changes
  useEffect(() => {
    gamePausedRef.current = gamePaused;
  }, [gamePaused]);

  // Keyboard event listener for pause/unpause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && gameStarted && !gameOver) {
        e.preventDefault(); // Prevent page scroll
        if (gamePaused) {
          // Unpause the game
          setGamePaused(false);
          // Request pointer lock again to hide cursor
          if (containerRef.current) {
            containerRef.current.requestPointerLock();
          }
        } else {
          // Pause the game
          setGamePaused(true);
          // Exit pointer lock to show cursor
          if (document.pointerLockElement === containerRef.current) {
            document.exitPointerLock();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, gameOver, gamePaused]);

  // Physics simulation
  useEffect(() => {
    // Don't start animation if game hasn't started, is over, or paused
    if (!gameStarted || gameOver || gamePaused) {
      return;
    }

    const animate = () => {
      if (!containerRef.current || !ballRef.current || !paddleRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Stop animation if game is over or paused (using ref for latest value)
      if (gameOverRef.current || gamePausedRef.current) {
        return;
      }

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const currentTime = performance.now();

      // Get current position relative to container center
      const currentX = x.get();
      const currentY = y.get();
      const currentVx = vx.get();
      const currentVy = vy.get();
      const currentPaddleX = paddleX.get();

      // Calculate delta time with improved frame-rate independence
      const rawDeltaTime = (currentTime - lastTime.current) / 16.67; // Normalize to 60fps
      const deltaTime = Math.max(0, Math.min(rawDeltaTime, 2)); // Clamp between 0 and 2
      lastTime.current = currentTime;

      // Apply gravity (frame-rate independent)
      let newVy = currentVy + GRAVITY * deltaTime;
      
      // Apply minimal friction to keep ball moving (frame-rate independent)
      const frictionFactor = Math.pow(FRICTION, deltaTime);
      let newVx = currentVx * frictionFactor;
      newVy = newVy * frictionFactor;

      // Clamp velocities to prevent extreme values
      const MAX_VELOCITY = 30;
      newVx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, newVx));
      newVy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, newVy));

      // Ensure minimum velocity to keep game going
      if (Math.abs(newVx) < MIN_VELOCITY && newVx !== 0) {
        newVx = newVx > 0 ? MIN_VELOCITY : -MIN_VELOCITY;
      }
      if (Math.abs(newVy) < MIN_VELOCITY && newVy !== 0) {
        newVy = newVy > 0 ? MIN_VELOCITY : -MIN_VELOCITY;
      }

      // Calculate new position
      let newX = currentX + newVx * deltaTime;
      let newY = currentY + newVy * deltaTime;

      // Boundary constraints (for ball center)
      const maxX = containerRect.width / 2 - BALL_SIZE / 2;
      const maxY = containerRect.height / 2 - BALL_SIZE / 2;
      const minX = -maxX;
      const minY = -maxY;

      // Screen bottom edge (absolute position from center)
      const screenBottom = containerRect.height / 2;

      // Paddle position and bounds
      const paddleY = containerRect.height / 2 - PADDLE_Y_OFFSET;
      const paddleMinX = currentPaddleX - PADDLE_WIDTH / 2;
      const paddleMaxX = currentPaddleX + PADDLE_WIDTH / 2;
      const paddleMinY = paddleY - PADDLE_HEIGHT / 2;
      const paddleMaxY = paddleY + PADDLE_HEIGHT / 2;

      // Calculate ball bounds
      const ballCenterX = newX;
      const ballCenterY = newY;
      const ballMinX = ballCenterX - BALL_SIZE / 2;
      const ballMaxX = ballCenterX + BALL_SIZE / 2;
      const ballMinY = ballCenterY - BALL_SIZE / 2;
      const ballMaxY = ballCenterY + BALL_SIZE / 2;

      // Game over check - if ball's bottom edge hits or goes below screen bottom
      // Check this before any other collisions
      if (ballMaxY >= screenBottom && newVy > 0) {
        // Stop the ball and set game over
        gameOverRef.current = true;
        setGameOver(true);
        // Freeze ball at bottom position
        newY = screenBottom - BALL_SIZE / 2;
        x.set(newX);
        y.set(newY);
        vx.set(0);
        vy.set(0);
        controls.set({ x: newX, y: newY });
        // Cancel animation frame to stop the loop
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
        return;
      }

      // Collision detection with walls
      if (newX > maxX) {
        newX = maxX;
        newVx = -newVx * BOUNCE_COEFFICIENT;
      } else if (newX < minX) {
        newX = minX;
        newVx = -newVx * BOUNCE_COEFFICIENT;
      }

      if (newY > maxY) {
        newY = maxY;
        newVy = -newVy * BOUNCE_COEFFICIENT;
      } else if (newY < minY) {
        newY = minY;
        newVy = -newVy * BOUNCE_COEFFICIENT;
      }

      // Recalculate ball bounds after wall collision adjustments
      const updatedBallMinX = newX - BALL_SIZE / 2;
      const updatedBallMaxX = newX + BALL_SIZE / 2;
      const updatedBallMinY = newY - BALL_SIZE / 2;
      const updatedBallMaxY = newY + BALL_SIZE / 2;

      // Collision detection with paddle
      if (
        updatedBallMaxX > paddleMinX &&
        updatedBallMinX < paddleMaxX &&
        updatedBallMaxY > paddleMinY &&
        updatedBallMinY < paddleMaxY &&
        newVy > 0 // Only bounce if ball is moving down
      ) {
        // Calculate bounce angle based on where ball hits paddle
        const hitPosition = (newX - currentPaddleX) / (PADDLE_WIDTH / 2);
        const angle = hitPosition * 0.5; // Max 30 degree angle
        
        // Calculate new velocity with angle
        const speed = Math.sqrt(newVx * newVx + newVy * newVy) * PADDLE_BOUNCE_COEFFICIENT;
        newVx = Math.sin(angle) * speed;
        newVy = -Math.abs(Math.cos(angle) * speed); // Always bounce up
        
        // Ensure ball is above paddle
        newY = paddleMinY - BALL_SIZE / 2;
      }

      // Top paddle position and bounds (only if top paddle ref exists)
      if (topPaddleRef.current) {
        const topPaddleY = -containerRect.height / 2 + 10 + PADDLE_HEIGHT / 2; // 10px from top
        const topPaddleRect = topPaddleRef.current.getBoundingClientRect();
        const topPaddleWidth = topPaddleRect.width;
        const topPaddleMinX = -topPaddleWidth / 2; // Top paddle is centered
        const topPaddleMaxX = topPaddleWidth / 2;
        const topPaddleMinY = topPaddleY - PADDLE_HEIGHT / 2;
        const topPaddleMaxY = topPaddleY + PADDLE_HEIGHT / 2;

        // Collision detection with top paddle
        if (
          updatedBallMaxX > topPaddleMinX &&
          updatedBallMinX < topPaddleMaxX &&
          updatedBallMaxY > topPaddleMinY &&
          updatedBallMinY < topPaddleMaxY &&
          newVy < 0 // Only bounce if ball is moving up
        ) {
          // Calculate bounce angle based on where ball hits paddle
          const hitPosition = newX / (topPaddleWidth / 2);
          const angle = hitPosition * 0.5; // Max 30 degree angle
          
          // Calculate new velocity with angle
          const speed = Math.sqrt(newVx * newVx + newVy * newVy) * PADDLE_BOUNCE_COEFFICIENT;
          newVx = Math.sin(angle) * speed;
          newVy = Math.abs(Math.cos(angle) * speed); // Always bounce down
          
          // Ensure ball is below top paddle
          newY = topPaddleMaxY + BALL_SIZE / 2;
          
          // Count point if this is a new hit (not already counted)
          if (!lastTopPaddleHit.current) {
            setPoints(prev => prev + 1);
            lastTopPaddleHit.current = true;
            // Play sound when ball hits top paddle
            playTopPaddleSound();
          }
        } else {
          // Reset hit flag when ball is not touching top paddle
          if (updatedBallMinY > topPaddleMaxY || updatedBallMaxY < topPaddleMinY) {
            lastTopPaddleHit.current = false;
          }
        }
      }

      // Update values
      x.set(newX);
      y.set(newY);
      vx.set(newVx);
      vy.set(newVy);

      // Update animation
      controls.set({ x: newX, y: newY });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [x, y, vx, vy, controls, paddleX, gameStarted, gameOver, gamePaused]);

  // Start game on click
  const handleStartGame = () => {
    if (!gameStarted) {
      setGameStarted(true);
      setPoints(0);
      setDisplayedScore(0);
      lastTopPaddleHit.current = false;
      lastTime.current = performance.now();
      x.set(0);
      y.set(-100);
      vx.set(INITIAL_VELOCITY * (Math.random() > 0.5 ? 1 : -1));
      vy.set(INITIAL_VELOCITY);
      controls.set({ x: 0, y: -100 });
    } else if (gameOver) {
      // Restart game after game over
      setGameOver(false);
      setGameStarted(true);
      setPoints(0);
      setDisplayedScore(0);
      lastTopPaddleHit.current = false;
      lastTime.current = performance.now();
      x.set(0);
      y.set(-100);
      vx.set(INITIAL_VELOCITY * (Math.random() > 0.5 ? 1 : -1));
      vy.set(INITIAL_VELOCITY);
      controls.set({ x: 0, y: -100 });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full flex-col items-center justify-center relative overflow-hidden ${pointerLocked ? 'cursor-none' : 'cursor-default'}`}
      onClick={handleStartGame}
    >
        <motion.div
          ref={topPaddleRef}
          className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[180px] md:w-[320px] h-5 rounded-lg bg-foreground/80 backdrop-blur-sm"
        ></motion.div>
      {/* Theme Toggle Button */}
      {mounted && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTheme(theme === 'dark' ? 'light' : 'dark');
          }}
          className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background/90 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-foreground" />
          )}
        </button>
      )}
      {gameStarted && !gameOver && (
        <>
          <div className="absolute top-4 left-4 text-xs opacity-60 z-50">
            Click on <span className="italic">Space</span> to {gamePaused ? 'resume' : 'pause'}
          </div>
          <div className="absolute top-4 right-16 text-xs opacity-60 z-50 flex items-center gap-1">
            Points: <span className="font-semibold"><NumberFlow value={points} /></span>
          </div>
        </>
      )}
      {!gameStarted && !gameOver && (
        <div className="absolute top-[20%] grid content-start justify-items-center gap-6 text-center z-20">
          <span className="relative max-w-[20ch] text-sm uppercase leading-tight opacity-60">
            Click to start the game
          </span>
          <span className="text-xs opacity-40">
            Move your mouse to control the paddle
          </span>
        </div>
      )}
      {gameOver && (
        <>
          {/* Blur background overlay */}
          <div className="absolute inset-0 bg-background/50 backdrop-blur-md z-30" />
          
          {/* Game Over Popup */}
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="grid content-start justify-items-center gap-6 text-center">
              <span className="relative max-w-[20ch] text-sm uppercase leading-tight opacity-80">
                Game Over
              </span>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs opacity-60">Your Score</span>
                <div className="text-4xl font-bold">
                  <NumberFlow
                    key={`score-${gameOver}-${points}`}
                    plugins={[continuous]}
                    value={displayedScore}
                    transformTiming={{ duration: 2000, easing: 'ease-out' }}
                    spinTiming={{ duration: 2000, easing: 'ease-out' }}
                    opacityTiming={{ duration: 1000, easing: 'ease-out' }}
                  />
                </div>
              </div>
              <span className="text-xs opacity-60">
                Click to restart
              </span>
            </div>
          </div>
        </>
      )}
      {gamePaused && gameStarted && !gameOver && (
        <div className="absolute top-[20%] grid content-start justify-items-center gap-6 text-center z-40">
          <span className="relative max-w-[20ch] text-sm uppercase leading-tight opacity-80">
            Paused
          </span>
        </div>
      )}
      <ul
        className="flex flex-col justify-end rounded-2xl"
        style={{
          filter: "url(#SkiperGooeyFilter)",
        }}
      >
        <motion.li
          ref={ballRef}
          animate={controls}
          style={{
            x,
            y,
          }}
          className="bg-foreground size-12 rounded-full"
        ></motion.li>
      </ul>
      <motion.div
        ref={paddleRef}
        animate={paddleControls}
        style={{
          filter: "url(#SkiperGooeyFilter)",
          x: paddleX,
        }}
        className="absolute bottom-[80px] w-[180px] h-5 rounded-lg bg-foreground/80 backdrop-blur-sm"
      ></motion.div>
    </div>
  );
};

export { Skiper64, SkiperGooeyFilterProvider };

const SkiperGooeyFilterProvider = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="absolute bottom-0 left-0"
      version="1.1"
    >
      <defs>
        <filter id="SkiperGooeyFilter">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.4" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -7"
            result="SkiperGooeyFilter"
          />
          <feBlend in="SourceGraphic" in2="SkiperGooeyFilter" />
        </filter>
      </defs>
    </svg>
  );
};

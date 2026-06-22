import { useRef, useEffect } from 'react';
import { PanResponder, Animated } from 'react-native';

/**
 * useSwipeTabs — swipe left/right to change tabs within a screen.
 *
 * Returns:
 *   panHandlers  — spread onto the outer View that should receive swipes
 *   indicatorX   — Animated.Value for sliding the active tab underline
 *   contentAnim  — Animated.Value (0→1) for fade/slide on tab change
 */
export function useSwipeTabs({ tabCount, tab, onTabChange, tabBarWidth = 0, tabWidth = 0 }) {
  const tabRef       = useRef(tab);
  const tabCountRef  = useRef(tabCount);
  const contentAnim  = useRef(new Animated.Value(1)).current;
  const indicatorX   = useRef(new Animated.Value(tab * tabWidth)).current;

  // Keep refs current without recreating PanResponder
  tabRef.current      = tab;
  tabCountRef.current = tabCount;

  // Animate indicator when tab changes
  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: tab * tabWidth,
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();
  }, [tab, tabWidth]);

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture when horizontal movement is clearly dominant
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2.5,

      onPanResponderRelease: (_, g) => {
        const current  = tabRef.current;
        const maxTab   = tabCountRef.current - 1;
        const THRESHOLD = 55;

        if (g.dx < -THRESHOLD && current < maxTab) {
          // Swipe left → next tab
          animateChange(() => onTabChange(current + 1));
        } else if (g.dx > THRESHOLD && current > 0) {
          // Swipe right → previous tab
          animateChange(() => onTabChange(current - 1));
        }
      },

      onPanResponderTerminate: () => {},
    })
  ).current;

  function animateChange(callback) {
    // Quick fade-out → switch → fade-in
    Animated.timing(contentAnim, {
      toValue: 0.6,
      duration: 80,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.spring(contentAnim, {
        toValue: 1,
        speed: 30,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    });
  }

  return {
    panHandlers: panResponder.panHandlers,
    indicatorX,
    contentAnim,
    animateChange,
  };
}

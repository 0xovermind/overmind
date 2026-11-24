import { redirect } from 'next/navigation';

/** Short link for the swipe deck (overmind.ink/swipe). */
export default function SwipePage() {
  redirect('/hive?view=swipe');
}

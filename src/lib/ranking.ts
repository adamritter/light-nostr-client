/*
   The ranking algorithm decides the order in which the threads are displayed.

   As theads can't be that easily predicted as they are not as refined, it's better
   to predict whether the user likes an event or not.

   counting ,,not likes'' is also interesting, it requires caching threads that are skipped.
   Another option is to add dislikes to the interface, and even make it private???

   The simplest algorithm is just to count the number of likes per person.
   Also there's a binary followed / not followed as another signal.

   I guess now these are 2 signals, logistic regression should be used.


   Table to learn:
   + note is liked by user 
   - time passed since note was created
   - note's author is followed by user 
   - number of likes
   - number of comments
   - share of likes from the author by the user in the past
   - does it contain image?
   - does it contain link?
   - does it contain video?
   - text length
   - likes by followers
   

  




*/

# ts-batch


### limitations
#### As this project is designed to be a simple tool, it has some limitations:  
This project uses javascript native Maps as it's built-in cache. *This means that cache hash equality is referential*. As a temporary solution, Objects and classes are converted to a string for hashing. if a user-defined hashFn is not provided, Classes must provide a toString() method that returns a unique string representation of the object.





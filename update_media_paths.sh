cd $1/media/original; 
for f in $(ls -1); do mkdir ${f:0:2}; mv $f ${f:0:2}; done
cd ../thumbnail
for f in $(ls -1); do mkdir ${f:0:2}; mv $f ${f:0:2}; done



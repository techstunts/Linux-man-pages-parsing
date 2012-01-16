<?php

$filepath = __DIR__ . '/' . 'man-pages-in-html';

$filename = "watch.html";

$regex_to_replace = array(
"'<div id=\"banner\"[^>]*>(.*?)</div>'is",
"'<div id=\"formLinks\"[^>]*>(.*?)</div>'is",
"'<div id=\"disqus_thread\"[^>]*>(.*?)</div>'is",
"'<div id=\"footer\"[^>]*>(.*?)</div></div>'is",
"'<noscript>(.*?)</noscript>'is",
"'<a href=\"http://disqus.com\"[^>]*>(.*?)</a>'is"
);

if ($handle = opendir($filepath)) {
    while (false !== ($filename = readdir($handle))) {
        if (strpos($filename, ".html") !== false) {
        	$filename = $filepath . '/' . $filename;
			$content = '';
        	$content = file_get_contents($filename);
        	foreach($regex_to_replace as $regex){
				$content = preg_replace($regex, "", $content);
        	}
			file_put_contents($filename, $content);
        	echo $filename . '<br />';
        }
        $filename = '';
    }
    closedir($handle);
}

/*
$content = file_get_contents($filename);
$content = preg_replace("'<div id=\"banner\"[^>]*>(.*?)</div>'is", "", $content);
$content = preg_replace("'<div id=\"formLinks\"[^>]*>(.*?)</div>'is", "", $content);
$content = preg_replace("'<div id=\"disqus_thread\"[^>]*>(.*?)</div>'is", "", $content);
$content = preg_replace("'<div id=\"footer\"[^>]*>(.*?)</div></div>'is", "", $content);
$content = preg_replace("'<noscript>(.*?)</noscript>'is", "", $content);
$content = preg_replace("'<a href=\"http://disqus.com\"[^>]*>(.*?)</a>'is", "", $content);

var_dump($content);
*/
<?php

//preg_match("/[^\w\.]/", http://linuxmanpages.com/man1/a2p.1.php

include("Crawler.php");
$mycrawler=new Crawler();
$url='http://linuxmanpages.com/man1/';
$link=$mycrawler->crawlLinks($url);

//print the result

echo "<table width=\"100%\" border=\"1\">
  <tr>
    <td width=\"15%\"><div align=\"center\"><b>Link Text </b></div></td>
    <td width=\"30%\"><div align=\"center\"><b>Link</b></div></td>
    <td width=\"40%\"><div align=\"center\"><b>Text with Link</b> </div></td>
    <td width=\"15%\"><div align=\"center\"><b>Link fetched and stored</b> </div></td>
  </tr>";
for($i=0;$i<sizeof($link['link']);$i++)
{
$result=$mycrawler->fetchAndSaveLink($link['link'][$i], $link['text'][$i]);

echo "<tr>
    <td><div align=\"center\">".$link['text'][$i]."</div></td>
    <td><div align=\"center\">".$link['link'][$i]."</div></td>
    <td><div align=\"center\"><a href=\"".$link['link'][$i]."\">".$link['text'][$i]."</a></div></td>
    <td>". $result . "</td>
  </tr>";        

}  
echo "</table>";
?> 
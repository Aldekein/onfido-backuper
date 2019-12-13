CREATE TABLE `files` (
  `applicantId` varchar(250) NOT NULL DEFAULT '',
  `documentId` varchar(250) NOT NULL DEFAULT '',
  `docType` varchar(100) NOT NULL DEFAULT '',
  `fileSize` bigint(20) NOT NULL,
  `fileType` varchar(11) NOT NULL DEFAULT '',
  `status` tinyint(4) NOT NULL DEFAULT 0,
  UNIQUE KEY `unique-pair` (`applicantId`,`documentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `checks` (
  `applicantId` varchar(36) NOT NULL DEFAULT '',
  `data` text NOT NULL,
  PRIMARY KEY (`applicantId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `applicants` (
  `applicantId` varchar(36) NOT NULL DEFAULT '',
  `documentCount` int(11) DEFAULT NULL,
  `data` text NOT NULL,
  PRIMARY KEY (`applicantId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
-- phpMyAdmin SQL Dump
-- version 4.8.5
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 23, 2020 at 11:43 AM
-- Server version: 10.1.38-MariaDB
-- PHP Version: 7.3.4

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `poker`
--

-- --------------------------------------------------------

--
-- Table structure for table `poker_cards`
--

CREATE TABLE `poker_cards` (
  `id` int(11) NOT NULL,
  `tid` int(11) NOT NULL,
  `cards` varchar(255) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `poker_hands`
--

CREATE TABLE `poker_hands` (
  `id` int(11) NOT NULL,
  `cardId` int(11) NOT NULL,
  `user` int(11) NOT NULL,
  `cards` varchar(255) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `poker_message`
--

CREATE TABLE `poker_message` (
  `id` int(11) NOT NULL,
  `tid` int(11) NOT NULL,
  `uid` int(11) NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `poker_points`
--

CREATE TABLE `poker_points` (
  `id` int(11) NOT NULL,
  `bank` int(11) NOT NULL,
  `commission` int(11) NOT NULL,
  `cardId` int(11) NOT NULL,
  `time` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `poker_result`
--

CREATE TABLE `poker_result` (
  `id` int(11) NOT NULL,
  `pid` int(11) NOT NULL,
  `uid` varchar(50) NOT NULL,
  `cash` float NOT NULL,
  `type` enum('lose','win') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `poker_setting`
--

CREATE TABLE `poker_setting` (
  `id` int(11) NOT NULL,
  `timer` int(11) NOT NULL,
  `commission` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `poker_setting`
--

INSERT INTO `poker_setting` (`id`, `timer`, `commission`) VALUES
(1, 500, 2);

-- --------------------------------------------------------

--
-- Table structure for table `poker_table`
--

CREATE TABLE `poker_table` (
  `id` int(11) NOT NULL,
  `name` varchar(25) COLLATE utf8_persian_ci NOT NULL DEFAULT 'poker',
  `type` enum('holdem','omaha') COLLATE utf8_persian_ci NOT NULL DEFAULT 'holdem',
  `player` int(11) NOT NULL DEFAULT '7',
  `min` float NOT NULL,
  `max` float NOT NULL,
  `sb` float NOT NULL,
  `bb` float NOT NULL,
  `order` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_persian_ci;

--
-- Dumping data for table `poker_table`
--

INSERT INTO `poker_table` (`id`, `name`, `type`, `player`, `min`, `max`, `sb`, `bb`, `order`) VALUES
(1, 'poker', 'holdem', 5, 500, 4000, 10, 50, 1),
(2, 'poker', 'holdem', 2, 200, 400, 10, 50, 1),
(3, 'poker', 'holdem', 3, 200, 400, 10, 50, 1),
(4, 'poker', 'holdem', 4, 200, 400, 10, 50, 1);

-- --------------------------------------------------------

--
-- Table structure for table `poker_users`
--

CREATE TABLE `poker_users` (
  `id` int(11) NOT NULL,
  `uid` int(11) NOT NULL,
  `admin` int(11) NOT NULL DEFAULT '0',
  `mute` int(11) NOT NULL DEFAULT '0',
  `avatar` varchar(30) NOT NULL,
  `status` int(11) NOT NULL DEFAULT '1'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `poker_cards`
--
ALTER TABLE `poker_cards`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_hands`
--
ALTER TABLE `poker_hands`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_message`
--
ALTER TABLE `poker_message`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_points`
--
ALTER TABLE `poker_points`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_result`
--
ALTER TABLE `poker_result`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_setting`
--
ALTER TABLE `poker_setting`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_table`
--
ALTER TABLE `poker_table`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `poker_users`
--
ALTER TABLE `poker_users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `poker_cards`
--
ALTER TABLE `poker_cards`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `poker_hands`
--
ALTER TABLE `poker_hands`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `poker_message`
--
ALTER TABLE `poker_message`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `poker_points`
--
ALTER TABLE `poker_points`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `poker_result`
--
ALTER TABLE `poker_result`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `poker_setting`
--
ALTER TABLE `poker_setting`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `poker_table`
--
ALTER TABLE `poker_table`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `poker_users`
--
ALTER TABLE `poker_users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

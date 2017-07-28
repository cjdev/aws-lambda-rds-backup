#!/usr/bin/env stack
-- stack runhaskell --package cloud-seeder
{-# LANGUAGE OverloadedStrings #-}

import Network.CloudSeeder

main :: IO ()
main = deployment "rds-backup" $ do
  tags [("cj:squad", "lambda")]
  stack_ "lambda"
